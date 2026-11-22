import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { desc, eq } from 'drizzle-orm';

import { db } from './src/db/index.ts';
import {
  batteryReports,
  customerProfiles,
  deliveryStatuses,
  drones,
  missionLogs,
  missions,
  notifications,
  parcels,
  users,
  weatherReports,
} from './src/db/schema.ts';
import {
  DELIVERY_STAGES,
  getAllMissionsWithDetails,
  getOrCreateUserRecord,
  getParcelTrackingBundle,
  getSingleMissionWithDetailsByParcelId,
  seedInitialFleetAndMissions,
} from './src/db/queries.ts';
import {
  buildMissionWaypoints,
  calculateMissionAssessment,
  geocodeDestination,
  haversineKm,
  MOTHER_BASE,
} from './src/lib/logistics.ts';
import {
  parseMissionCommandWithAI,
  queryMapsGroundingWithAI,
  querySearchGroundingWithAI,
  runMultiTurnChatWithAI,
  type ChatTurnInput,
} from './src/lib/gemini.ts';
import type { ChatMode } from './src/types/aegis.ts';
import {
  type AuthRequest,
  requireAuth,
  requireOperator,
  requireParcelAccess,
  resolveUserFromToken,
  signParcelToken,
  signSessionToken,
  verifyParcelToken,
} from './src/middleware/auth.ts';

const PORT = 3000;
const OPERATOR_PASSCODE = process.env.AEGIS_OPERATOR_PASSCODE || 'AEGIS-OPS-2026';

interface ParcelOtpRecord {
  otpHash: string;
  parcelId: number;
  parcelNumber: string;
  recipientName: string;
  recipientEmail: string;
  expiresAt: number;
  attempts: number;
}

const parcelOtpStore = new Map<string, ParcelOtpRecord>();

function hashParcelOtp(parcelNumber: string, otp: string): string {
  return crypto
    .createHash('sha256')
    .update(`${parcelNumber.trim().toUpperCase()}:${otp.trim()}`)
    .digest('hex');
}

function sanitizeEmail(email: string): string {
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return trimmed;
  const local = trimmed.slice(0, atIdx).replace(/\.+$/, '');
  const domain = trimmed.slice(atIdx + 1);
  return `${local}@${domain}`;
}

function maskEmailAddress(email: string): string {
  const clean = sanitizeEmail(email);
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '••••@gmail.com';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx);
  if (local.length <= 2) {
    return `${local[0] || '•'}••••${domain}`;
  }
  return `${local.slice(0, 2)}••••${local.slice(-2)}${domain}`;
}

async function sendGmailOtpEmail(params: {
  accessToken: string;
  toEmail: string;
  parcelNumber: string;
  recipientName: string;
  otp: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; status: number; error: string }> {
  const cleanSubjectParcel = params.parcelNumber.replace(/[\r\n]/g, '');
  const cleanRecipient = params.recipientName.replace(/[\r\n]/g, '');
  const cleanTo = sanitizeEmail(params.toEmail).replace(/[\r\n]/g, '');

  const rawLines = [
    `To: ${cleanTo}`,
    `Subject: AEGIS Parcel Verification Code - ${cleanSubjectParcel}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    `Hello ${cleanRecipient},`,
    '',
    `Your 6-digit AEGIS verification OTP for parcel ${cleanSubjectParcel} is: ${params.otp}`,
    '',
    'This verification code expires in 5 minutes. Do not share it with anyone.',
    '',
    'AEGIS Air Delivery · Gajularamaram Hub, Hyderabad',
  ];

  const rawEncoded = Buffer.from(rawLines.join('\r\n'), 'utf8').toString('base64url');
  const gmailRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawEncoded }),
    }
  );

  if (!gmailRes.ok) {
    let errDetail = 'Failed to send verification email via Gmail.';
    try {
      const errJson = (await gmailRes.json()) as {
        error?: { message?: string };
      };
      if (errJson.error?.message) errDetail = errJson.error.message;
    } catch {
      // Ignore parse failure
    }
    return { ok: false, status: gmailRes.status, error: errDetail };
  }

  const data = (await gmailRes.json()) as { id?: string };
  return { ok: true, messageId: data.id };
}

let seedPromise: Promise<void> | null = null;
async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seedInitialFleetAndMissions().catch((err) => {
      seedPromise = null;
      console.error('Lazy seed error:', err);
    });
  }
  await seedPromise;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const wsSubscriptions = new WeakMap<
    WebSocket,
    { role: 'none' | 'operator' | 'parcel'; parcelId?: number }
  >();

  wss.on('connection', (ws) => {
    wsSubscriptions.set(ws, { role: 'none' });
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          token?: string;
          parcelToken?: string;
        };
        if (msg.type === 'subscribe:operator' && msg.token) {
          const user = await resolveUserFromToken(msg.token);
          if (user?.role === 'operator') {
            wsSubscriptions.set(ws, { role: 'operator' });
          }
        } else if (msg.type === 'subscribe:parcel' && msg.parcelToken) {
          const parcelSess = verifyParcelToken(msg.parcelToken);
          if (parcelSess) {
            wsSubscriptions.set(ws, { role: 'parcel', parcelId: parcelSess.parcelId });
          }
        } else if (msg.type === 'unsubscribe') {
          wsSubscriptions.set(ws, { role: 'none' });
        }
      } catch {
        // Ignore malformed ws control frame
      }
    });
  });

  function broadcast(payload: Record<string, unknown>) {
    const serialized = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const sub = wsSubscriptions.get(client);
      if (sub?.role === 'operator') {
        client.send(serialized);
      }
    });
  }

  function broadcastParcelTick(parcelId: number, mission: unknown, drone: unknown) {
    const serialized = JSON.stringify({ type: 'parcel:tick', mission, drone });
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const sub = wsSubscriptions.get(client);
      if (sub?.role === 'parcel' && sub.parcelId === parcelId) {
        client.send(serialized);
      }
    });
  }

  // Lazy seed middleware on API traffic (never eager on startup)
  app.use('/api', async (_req, _res, next) => {
    await ensureSeeded();
    next();
  });

  // Public runtime configuration (Google Maps API key if present)
  app.get('/api/config/public', (_req, res) => {
    res.json({
      mapsApiKey:
        process.env.VITE_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        '',
      motherBase: MOTHER_BASE,
    });
  });

  // --- AUTHENTICATION ENDPOINTS ---

  // 1. Firebase Google Sign-In session sync
  app.post('/api/auth/firebase-sync', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Firebase token' });
      }
      const idToken = authHeader.slice('Bearer '.length).trim();
      const verified = await resolveUserFromToken(idToken);
      if (!verified) {
        return res.status(401).json({ error: 'Invalid Firebase ID token' });
      }

      const requestedRole =
        req.body?.role === 'operator' &&
        req.body?.operatorPasscode === OPERATOR_PASSCODE
          ? 'operator'
          : 'customer';

      const { user, profile } = await getOrCreateUserRecord({
        uid: verified.uid,
        email: verified.email,
        name: req.body?.name || verified.name,
        phone: req.body?.phone,
        role: requestedRole,
      });

      const sessionToken = signSessionToken({
        uid: user.uid,
        email: user.email,
        phone: user.phone || '',
        name: user.name,
        role: user.role as 'customer' | 'operator',
      });

      res.json({ user, profile, token: sessionToken });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Authentication failed';
      res.status(500).json({ error: msg });
    }
  });

  // 2. Role-verified Mobile OTP / Email-Password / Operator Staff Sign-In
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { method, identifier, otpCode, password, name, role, operatorPasscode } =
        req.body as {
          method: 'otp' | 'email' | 'operator';
          identifier: string;
          otpCode?: string;
          password?: string;
          name?: string;
          role?: 'customer' | 'operator';
          operatorPasscode?: string;
        };

      if (!identifier?.trim()) {
        return res.status(400).json({ error: 'Please provide your email or mobile number.' });
      }

      if (method === 'otp') {
        if (!otpCode || otpCode.trim().length < 4) {
          return res.status(400).json({ error: 'Enter the 6-digit verification code (demo: 482910).' });
        }
      }

      if (method === 'email') {
        if (!password || password.length < 4) {
          return res.status(400).json({ error: 'Password must be at least 4 characters.' });
        }
      }

      const targetRole: 'customer' | 'operator' =
        method === 'operator' || role === 'operator' ? 'operator' : 'customer';

      if (targetRole === 'operator') {
        if ((operatorPasscode || password) !== OPERATOR_PASSCODE) {
          return res.status(403).json({
            error: `Invalid staff clearance code. Use authorized code: ${OPERATOR_PASSCODE}`,
          });
        }
      }

      const cleanId = identifier.trim().toLowerCase();
      const uid = `${targetRole}-${cleanId.replace(/[^a-z0-9]/g, '-')}`;
      const isPhone = /^[+\d\s-]{8,}$/.test(identifier.trim());
      const email = isPhone ? `${uid}@sms.aegis.in` : cleanId;
      const phone = isPhone ? identifier.trim() : '+91 98490 24511';
      const displayName =
        name?.trim() ||
        (targetRole === 'operator'
          ? 'Cmdr. Vikram Aditya'
          : isPhone
            ? 'Lakshmi Narayana'
            : cleanId.split('@')[0]);

      const { user, profile } = await getOrCreateUserRecord({
        uid,
        email,
        phone,
        name: displayName,
        role: targetRole,
      });

      const token = signSessionToken({
        uid: user.uid,
        email: user.email,
        phone: user.phone || '',
        name: user.name,
        role: targetRole,
      });

      res.json({ user, profile, token });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Sign-in failed';
      res.status(500).json({ error: msg });
    }
  });

  // 3. Profile fetch & update
  app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { user, profile } = await getOrCreateUserRecord({
        uid: req.sessionUser!.uid,
        email: req.sessionUser!.email,
        name: req.sessionUser!.name,
        role: req.sessionUser!.role,
      });
      res.json({ user, profile });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load profile';
      res.status(500).json({ error: msg });
    }
  });

  app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, phone, defaultAddress, languagePref, pushEnabled, smsEnabled, emailEnabled } =
        req.body;

      const [updatedUser] = await db
        .update(users)
        .set({
          ...(name ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(languagePref ? { languagePref } : {}),
        })
        .where(eq(users.uid, req.sessionUser!.uid))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      let coords = undefined;
      if (defaultAddress) {
        coords = await geocodeDestination(defaultAddress);
      }

      const [updatedProfile] = await db
        .update(customerProfiles)
        .set({
          ...(defaultAddress ? { defaultAddress } : {}),
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
          ...(typeof pushEnabled === 'boolean' ? { pushEnabled } : {}),
          ...(typeof smsEnabled === 'boolean' ? { smsEnabled } : {}),
          ...(typeof emailEnabled === 'boolean' ? { emailEnabled } : {}),
          updatedAt: new Date(),
        })
        .where(eq(customerProfiles.userId, updatedUser.id))
        .returning();

      res.json({ user: updatedUser, profile: updatedProfile });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update profile';
      res.status(500).json({ error: msg });
    }
  });

  // --- CUSTOMER PARCEL OTP VERIFICATION & SCOPED TRACKING ENDPOINTS ---

  app.post('/api/parcels/request-otp', async (req, res) => {
    try {
      const { parcelNumber } = req.body as { parcelNumber?: string };
      const query = (parcelNumber || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'Please enter your parcel number.' });
      }

      const normalized = query.toLowerCase();
      const allParcels = await db.select().from(parcels);
      const found = allParcels.find(
        (p) =>
          p.parcelNumber.toLowerCase() === normalized ||
          p.parcelNumber.replace('#', '').toLowerCase() === normalized.replace('#', '')
      );

      if (!found) {
        return res.status(404).json({ error: 'Invalid Parcel Number' });
      }

      const recipientEmail = sanitizeEmail(found.recipientEmail || '');
      if (!recipientEmail) {
        return res.status(400).json({
          error: 'No Gmail address is linked with this parcel number.',
        });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const key = found.parcelNumber.toUpperCase();
      parcelOtpStore.set(key, {
        otpHash: hashParcelOtp(found.parcelNumber, otp),
        parcelId: found.id,
        parcelNumber: found.parcelNumber,
        recipientName: found.recipientName,
        recipientEmail,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
      });

      const maskedEmail = maskEmailAddress(recipientEmail);
      const authHeader = req.headers.authorization;
      const gmailToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';

      if (gmailToken) {
        const sent = await sendGmailOtpEmail({
          accessToken: gmailToken,
          toEmail: recipientEmail,
          parcelNumber: found.parcelNumber,
          recipientName: found.recipientName,
          otp,
        });

        if (!sent.ok) {
          parcelOtpStore.delete(key);
          if (sent.status === 401 || sent.status === 403) {
            return res.status(401).json({
              error:
                'Gmail authorization expired or missing permission. Please Sign in with Google again.',
              needsGmailAuth: true,
            });
          }
          return res.status(502).json({ error: sent.error });
        }

        await db.insert(notifications).values({
          parcelNumber: found.parcelNumber,
          eventType: 'Gmail OTP Verification',
          channel: 'email',
          title: `Verification OTP emailed via Gmail for ${found.parcelNumber}`,
          message: `6-digit security code sent to ${maskedEmail} via Gmail.`,
          recipientTarget: recipientEmail,
          isRead: false,
        });

        return res.json({
          ok: true,
          deliveryMethod: 'gmail',
          gmailSent: true,
          parcelNumber: found.parcelNumber,
          recipientName: found.recipientName,
          maskedEmail,
          expiresInSeconds: 300,
        });
      }

      await db.insert(notifications).values({
        parcelNumber: found.parcelNumber,
        eventType: 'Gmail OTP Verification',
        channel: 'email',
        title: `Email verification OTP prepared for ${found.parcelNumber}`,
        message: `6-digit security code prepared for registered Gmail ${maskedEmail}.`,
        recipientTarget: recipientEmail,
        isRead: false,
      });

      res.json({
        ok: true,
        deliveryMethod: 'preview_email',
        gmailSent: false,
        parcelNumber: found.parcelNumber,
        recipientName: found.recipientName,
        maskedEmail,
        expiresInSeconds: 300,
        previewOtp: otp,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unable to send Gmail OTP';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/parcels/gmail-otp-check', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const gmailToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
      if (!gmailToken) {
        return res.status(401).json({ error: 'Gmail authorization required' });
      }
      const parcelNumber = String(req.query.parcelNumber || '').trim();
      if (!parcelNumber) {
        return res.status(400).json({ error: 'parcelNumber is required' });
      }

      const q = encodeURIComponent(`"AEGIS" "${parcelNumber}"`);
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=3`,
        {
          headers: { Authorization: `Bearer ${gmailToken}` },
        }
      );
      if (!listRes.ok) {
        return res.status(listRes.status).json({
          error: 'Unable to read Gmail messages. Please reconnect Google Sign-In.',
        });
      }

      const listData = (await listRes.json()) as {
        messages?: Array<{ id: string }>;
      };
      for (const item of listData.messages || []) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${gmailToken}` },
          }
        );
        if (!msgRes.ok) continue;
        const msgJson = (await msgRes.json()) as {
          snippet?: string;
          payload?: {
            body?: { data?: string };
            parts?: Array<{ body?: { data?: string } }>;
          };
        };
        const rawParts = [
          msgJson.snippet || '',
          msgJson.payload?.body?.data
            ? Buffer.from(msgJson.payload.body.data, 'base64url').toString('utf8')
            : '',
          ...(msgJson.payload?.parts || []).map((p) =>
            p.body?.data ? Buffer.from(p.body.data, 'base64url').toString('utf8') : ''
          ),
        ].join('\n');

        const match = rawParts.match(/is:\s*(\d{6})/i) || rawParts.match(/\b(\d{6})\b/);
        if (match?.[1]) {
          return res.json({ found: true, otp: match[1] });
        }
      }

      return res.json({ found: false });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unable to check Gmail inbox';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/parcels/verify-otp', async (req, res) => {
    try {
      const { parcelNumber, otp } = req.body as {
        parcelNumber?: string;
        otp?: string;
      };
      const query = (parcelNumber || '').trim();
      const cleanOtp = (otp || '').trim();
      if (!query || !cleanOtp) {
        return res
          .status(400)
          .json({ error: 'Parcel number and 6-digit OTP are required.' });
      }

      const normalized = query.toLowerCase();
      const allParcels = await db.select().from(parcels);
      const found = allParcels.find(
        (p) =>
          p.parcelNumber.toLowerCase() === normalized ||
          p.parcelNumber.replace('#', '').toLowerCase() === normalized.replace('#', '')
      );

      if (!found) {
        return res.status(404).json({ error: 'Invalid Parcel Number' });
      }

      const key = found.parcelNumber.toUpperCase();
      const record = parcelOtpStore.get(key);
      if (!record || record.expiresAt < Date.now()) {
        parcelOtpStore.delete(key);
        return res.status(400).json({
          error: 'OTP has expired or was not requested. Please request a new OTP.',
        });
      }

      if (record.attempts >= 5) {
        parcelOtpStore.delete(key);
        return res.status(429).json({
          error: 'Too many incorrect OTP attempts. Please request a new OTP.',
        });
      }

      const candidateBuf = Buffer.from(hashParcelOtp(found.parcelNumber, cleanOtp), 'hex');
      const expectedBuf = Buffer.from(record.otpHash, 'hex');
      const matches =
        candidateBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(candidateBuf, expectedBuf);

      if (!matches) {
        record.attempts += 1;
        return res.status(401).json({
          error: `Incorrect OTP (${5 - record.attempts} attempts remaining).`,
        });
      }

      parcelOtpStore.delete(key);

      const parcelToken = signParcelToken({
        parcelId: found.id,
        parcelNumber: found.parcelNumber,
        recipientName: found.recipientName,
      });

      const mission = await getSingleMissionWithDetailsByParcelId(found.id);
      const parcelNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.parcelNumber, found.parcelNumber))
        .orderBy(desc(notifications.createdAt))
        .limit(20);

      res.json({
        verified: true,
        parcelToken,
        mission,
        drone: mission?.drone || null,
        notifications: parcelNotifs,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'OTP verification failed';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/customer/parcel', requireParcelAccess, async (req: AuthRequest, res) => {
    try {
      const sess = req.parcelSession!;
      const mission = await getSingleMissionWithDetailsByParcelId(sess.parcelId);
      if (!mission) {
        return res.status(404).json({ error: 'Parcel mission not found.' });
      }
      const parcelNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.parcelNumber, sess.parcelNumber))
        .orderBy(desc(notifications.createdAt))
        .limit(20);

      res.json({
        mission,
        drone: mission.drone || null,
        notifications: parcelNotifs,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load parcel';
      res.status(500).json({ error: msg });
    }
  });

  // --- OPERATOR & PARCEL-SCOPED TRACKING ENDPOINTS ---

  app.get('/api/parcels', requireOperator, async (_req, res) => {
    try {
      const details = await getAllMissionsWithDetails();
      res.json(details);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to list parcels';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/parcels/track/:parcelNumber', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
      const parcelHdr = (req.headers['x-parcel-token'] as string | undefined) || '';

      const opUser = token ? await resolveUserFromToken(token) : null;
      const parcelSess = verifyParcelToken(parcelHdr || token);
      const requestedNum = req.params.parcelNumber.trim().toLowerCase().replace('#', '');

      const allowed =
        opUser?.role === 'operator' ||
        (parcelSess &&
          parcelSess.parcelNumber.toLowerCase().replace('#', '') === requestedNum);

      if (!allowed) {
        return res.status(401).json({ error: 'Parcel OTP verification required' });
      }

      const bundle = await getParcelTrackingBundle(req.params.parcelNumber);
      if (!bundle) {
        return res.status(404).json({ error: 'Invalid Parcel Number' });
      }
      res.json(bundle);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to track parcel';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/parcels/verify-qr', async (req, res) => {
    try {
      const { parcelNumber, qrCode } = req.body as {
        parcelNumber: string;
        qrCode: string;
      };

      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
      const parcelHdr = (req.headers['x-parcel-token'] as string | undefined) || '';

      const opUser = token ? await resolveUserFromToken(token) : null;
      const parcelSess = verifyParcelToken(parcelHdr || token);
      const requestedNum = (parcelNumber || '').trim().toLowerCase().replace('#', '');

      const allowed =
        opUser?.role === 'operator' ||
        (parcelSess &&
          parcelSess.parcelNumber.toLowerCase().replace('#', '') === requestedNum);

      if (!allowed) {
        return res.status(401).json({ error: 'Parcel OTP verification required' });
      }

      const bundle = await getParcelTrackingBundle(parcelNumber);
      if (!bundle) {
        return res.status(404).json({ error: 'Invalid Parcel Number' });
      }
      const verified =
        bundle.parcel.qrCode.toLowerCase() === (qrCode || '').trim().toLowerCase();
      res.json({
        verified,
        parcelNumber: bundle.parcel.parcelNumber,
        recipientName: bundle.parcel.recipientName,
        stage: bundle.parcel.currentStage,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'QR verification failed';
      res.status(500).json({ error: msg });
    }
  });

  // --- NOTIFICATIONS ---

  app.get('/api/notifications', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
      const parcelHdr = (req.headers['x-parcel-token'] as string | undefined) || '';

      const opUser = token ? await resolveUserFromToken(token) : null;
      if (opUser?.role === 'operator') {
        const list = await db
          .select()
          .from(notifications)
          .orderBy(desc(notifications.createdAt))
          .limit(40);
        return res.json(list);
      }

      const parcelSess = verifyParcelToken(parcelHdr || token);
      if (parcelSess) {
        const list = await db
          .select()
          .from(notifications)
          .where(eq(notifications.parcelNumber, parcelSess.parcelNumber))
          .orderBy(desc(notifications.createdAt))
          .limit(20);
        return res.json(list);
      }

      return res.status(401).json({ error: 'Authentication or parcel verification required' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load notifications';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/notifications/read-all', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
      const parcelHdr = (req.headers['x-parcel-token'] as string | undefined) || '';

      const opUser = token ? await resolveUserFromToken(token) : null;
      if (opUser?.role === 'operator') {
        await db.update(notifications).set({ isRead: true });
        return res.json({ ok: true });
      }

      const parcelSess = verifyParcelToken(parcelHdr || token);
      if (parcelSess) {
        await db
          .update(notifications)
          .set({ isRead: true })
          .where(eq(notifications.parcelNumber, parcelSess.parcelNumber));
        return res.json({ ok: true });
      }

      return res.status(401).json({ error: 'Unauthorized' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to mark read';
      res.status(500).json({ error: msg });
    }
  });

  // --- FLEET, WEATHER, BATTERY & ORACLE TELEMETRY (OPERATOR) ---

  app.get('/api/fleet', requireOperator, async (_req, res) => {
    try {
      const fleet = await db.select().from(drones).orderBy(drones.id);
      const batteries = await db
        .select()
        .from(batteryReports)
        .orderBy(desc(batteryReports.recordedAt));
      const [latestWeather] = await db
        .select()
        .from(weatherReports)
        .orderBy(desc(weatherReports.recordedAt))
        .limit(1);

      res.json({
        drones: fleet,
        batteryReports: batteries,
        weather: latestWeather || null,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load fleet';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/fleet', requireOperator, async (req: AuthRequest, res) => {
    try {
      const {
        code,
        model,
        maxPayloadKg,
        batteryPct,
        healthPct,
        formationGroup,
        meshStatus,
        status,
      } = req.body as {
        code: string;
        model?: string;
        maxPayloadKg?: number;
        batteryPct?: number;
        healthPct?: number;
        formationGroup?: string;
        meshStatus?: 'connected' | 'relay' | 'standby';
        status?: 'available' | 'busy' | 'maintenance';
      };

      const normalizedCode = (code || '').trim().toUpperCase();
      if (!normalizedCode || normalizedCode.length < 3) {
        return res
          .status(400)
          .json({ error: 'Drone code is required (e.g., PHANTOM-06).' });
      }

      const existing = await db
        .select()
        .from(drones)
        .where(eq(drones.code, normalizedCode));
      if (existing.length > 0) {
        return res
          .status(409)
          .json({ error: `Drone ${normalizedCode} already exists in fleet.` });
      }

      const payload = Math.min(25, Math.max(0.5, Number(maxPayloadKg) || 5.0));
      const battery = Math.min(100, Math.max(10, Math.round(Number(batteryPct) || 100)));
      const health = Math.min(100, Math.max(10, Math.round(Number(healthPct) || 98)));
      const safeStatus =
        status === 'busy' || status === 'maintenance' ? status : 'available';
      const safeMesh =
        meshStatus === 'relay' || meshStatus === 'standby'
          ? meshStatus
          : 'connected';

      // Slight offset around Mother Base pad so new aircraft markers don't overlap identically
      const countOffset = (await db.select().from(drones)).length;
      const latOffset = ((countOffset % 5) - 2) * 0.0005;
      const lngOffset = (((countOffset + 1) % 5) - 2) * 0.0005;

      const [created] = await db
        .insert(drones)
        .values({
          code: normalizedCode,
          model: model?.trim() || 'AEGIS MK-IV Quadrotor',
          status: safeStatus,
          batteryPct: battery,
          healthPct: health,
          maxPayloadKg: payload,
          currentLat: Number((MOTHER_BASE.lat + latOffset).toFixed(6)),
          currentLng: Number((MOTHER_BASE.lng + lngOffset).toFixed(6)),
          altitudeM: 0,
          speedKmh: 0,
          formationGroup: formationGroup?.trim() || 'BASE-RESERVE',
          meshStatus: safeMesh,
        })
        .returning();

      await db.insert(batteryReports).values({
        droneId: created.id,
        cycleCount: 1,
        voltageMv: 25100,
        temperatureC: 26.5,
        healthPct: created.healthPct,
        chargePct: created.batteryPct,
      });

      broadcast({ type: 'fleet:updated', drone: created });
      res.status(201).json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to register new drone';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/fleet/:id/status', requireOperator, async (req: AuthRequest, res) => {
    try {
      const droneId = Number(req.params.id);
      const { status, batteryPct } = req.body as {
        status?: 'available' | 'busy' | 'maintenance';
        batteryPct?: number;
      };
      const [updated] = await db
        .update(drones)
        .set({
          ...(status ? { status } : {}),
          ...(typeof batteryPct === 'number' ? { batteryPct } : {}),
          updatedAt: new Date(),
        })
        .where(eq(drones.id, droneId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Drone not found' });
      }
      broadcast({ type: 'fleet:updated', drone: updated });
      res.json(updated);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update drone status';
      res.status(500).json({ error: msg });
    }
  });

  // --- AUTOMATED DELIVERY DISPATCH (OPERATOR) ---

  interface DispatchMissionInput {
    parcelNumber: string;
    recipientName: string;
    recipientPhone?: string;
    recipientEmail?: string;
    address: string;
    deliveryDate?: string;
    deliveryTime?: string;
    weightKg?: number;
    priority?: 'low' | 'medium' | 'high' | 'emergency';
    selectedDroneId?: number | null;
    autoAssign?: boolean;
  }

  async function executeMissionDispatch(
    input: DispatchMissionInput,
    actorName: string
  ) {
    const {
      parcelNumber,
      recipientName,
      recipientPhone,
      recipientEmail,
      address,
      deliveryDate,
      deliveryTime,
      weightKg,
      priority,
      selectedDroneId,
      autoAssign,
    } = input;

    if (!parcelNumber?.trim() || !recipientName?.trim() || !address?.trim()) {
      throw new Error('Parcel number, recipient name, and address are required.');
    }

    const cleanParcelNum = parcelNumber.trim();
    const existingParcel = await db
      .select()
      .from(parcels)
      .where(eq(parcels.parcelNumber, cleanParcelNum));
    if (existingParcel.length > 0) {
      throw new Error(`Parcel number ${cleanParcelNum} already exists.`);
    }

    // 1. Geocode address -> lat/lng
    const geo = await geocodeDestination(address);

    // 2. Calculate mission distance
    const distanceKm = haversineKm(
      MOTHER_BASE.lat,
      MOTHER_BASE.lng,
      geo.lat,
      geo.lng
    );

    // 3. Check weather
    const [weather] = await db
      .select()
      .from(weatherReports)
      .orderBy(desc(weatherReports.recordedAt))
      .limit(1);

    const windSpeedKmh = weather?.windSpeedKmh ?? 11.4;
    const visibilityKm = weather?.visibilityKm ?? 10;
    const precipitationMm = weather?.precipitationMm ?? 0;

    // 4. Check drone availability & assign best drone
    const allDrones = await db.select().from(drones);
    const weight = Number(weightKg) || 1.5;

    let chosenDrone =
      !autoAssign && selectedDroneId
        ? allDrones.find((d) => d.id === Number(selectedDroneId))
        : undefined;

    if (!chosenDrone) {
      const candidates = allDrones
        .filter(
          (d) =>
            d.status === 'available' &&
            d.maxPayloadKg >= weight &&
            d.batteryPct >= 30
        )
        .sort(
          (a, b) =>
            b.batteryPct * 0.6 +
            b.healthPct * 0.4 -
            (a.batteryPct * 0.6 + a.healthPct * 0.4)
        );
      chosenDrone =
        candidates[0] ||
        allDrones.find((d) => d.status !== 'maintenance' && d.maxPayloadKg >= weight) ||
        allDrones.find((d) => d.status !== 'maintenance') ||
        allDrones[0];
    }

    if (!chosenDrone) {
      throw new Error('No drones registered in fleet.');
    }

    // 5. Estimate battery requirement & risk score
    const assessment = calculateMissionAssessment({
      distanceKm,
      weightKg: weight,
      windSpeedKmh,
      visibilityKm,
      precipitationMm,
      droneBatteryPct: chosenDrone.batteryPct,
      droneHealthPct: chosenDrone.healthPct,
    });

    // 6. Generate digital mission package & persist
    const qrCode = `AEGIS-VER-${cleanParcelNum.replace(/[^A-Za-z0-9]/g, '')}-HYD`;
    const waypoints = buildMissionWaypoints(
      MOTHER_BASE.lat,
      MOTHER_BASE.lng,
      geo.lat,
      geo.lng
    );

    const [newParcel] = await db
      .insert(parcels)
      .values({
        parcelNumber: cleanParcelNum,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone?.trim() || '+91 98490 00000',
        recipientEmail: sanitizeEmail(recipientEmail || '') || 'customer@aegis.in',
        pickupAddress: MOTHER_BASE.address,
        pickupLat: MOTHER_BASE.lat,
        pickupLng: MOTHER_BASE.lng,
        destinationAddress: geo.formattedAddress,
        destLat: geo.lat,
        destLng: geo.lng,
        weightKg: weight,
        priority: priority || 'medium',
        currentStage: 'Mission Prepared',
        qrCode,
      })
      .returning();

    for (const stage of DELIVERY_STAGES.slice(0, 3)) {
      await db.insert(deliveryStatuses).values({
        parcelId: newParcel.id,
        stage,
        note:
          stage === 'Drone Assigned'
            ? `Auto-assigned ${chosenDrone.code} (${chosenDrone.batteryPct}% battery)`
            : `Automated logistics package generated (${distanceKm} km · ${geo.source})`,
      });
    }

    const missionCode = `MSN-${Math.floor(8810 + Math.random() * 1100)}-${Math.floor(10 + Math.random() * 89)}`;
    const etaDate = new Date(Date.now() + assessment.etaMinutes * 60000);

    const [newMission] = await db
      .insert(missions)
      .values({
        missionCode,
        parcelId: newParcel.id,
        droneId: chosenDrone.id,
        status: 'preparing',
        distanceKm,
        estimatedBatteryPct: assessment.estimatedBatteryPct,
        riskScore: assessment.riskScore,
        successProbability: assessment.successProbability,
        waypointsJson: JSON.stringify(waypoints),
        progressPct: 12,
        departureTime:
          deliveryDate && deliveryTime
            ? new Date(`${deliveryDate}T${deliveryTime}:00`)
            : new Date(),
        eta: etaDate,
      })
      .returning();

    await db
      .update(drones)
      .set({
        status: 'busy',
        currentLat: MOTHER_BASE.lat,
        currentLng: MOTHER_BASE.lng,
        altitudeM: 25,
        speedKmh: 0,
        updatedAt: new Date(),
      })
      .where(eq(drones.id, chosenDrone.id));

    await db.insert(missionLogs).values({
      missionId: newMission.id,
      droneCode: chosenDrone.code,
      eventType: 'MISSION_PACKAGE_GENERATED',
      message: `Geocode (${geo.lat}, ${geo.lng}) · Dist ${distanceKm} km · Est Battery ${assessment.estimatedBatteryPct}% · Success ${assessment.successProbability}%`,
      actor: actorName,
    });

    const alertChannels: Array<'push' | 'sms' | 'email'> = ['push', 'sms', 'email'];
    const createdAlerts = await db
      .insert(notifications)
      .values(
        alertChannels.map((ch) => ({
          parcelNumber: newParcel.parcelNumber,
          eventType: 'Parcel Confirmed',
          channel: ch,
          title: `Parcel ${newParcel.parcelNumber} Scheduled with ${chosenDrone!.code}`,
          message: `Automated dispatch ready for ${geo.formattedAddress}. ETA ${assessment.etaMinutes} mins.`,
          recipientTarget:
            ch === 'sms'
              ? newParcel.recipientPhone
              : ch === 'email'
                ? newParcel.recipientEmail || 'recipient-alert@aegis.in'
                : 'Web Push Channel',
          isRead: false,
        }))
      )
      .returning();

    return {
      parcel: newParcel,
      mission: newMission,
      drone: chosenDrone,
      notifications: createdAlerts,
      assessment: {
        ...assessment,
        distanceKm,
        coordinates: { lat: geo.lat, lng: geo.lng },
        geocodeSource: geo.source,
        weatherCondition: weather?.condition || 'Clear Sky',
      },
    };
  }

  app.post('/api/missions/dispatch', requireOperator, async (req: AuthRequest, res) => {
    try {
      const result = await executeMissionDispatch(
        req.body,
        req.sessionUser?.name || 'Operator'
      );
      broadcast({
        type: 'mission:created',
        mission: result.mission,
        parcel: result.parcel,
        drone: result.drone,
        notifications: result.notifications,
      });
      res.status(201).json({
        parcel: result.parcel,
        mission: result.mission,
        drone: result.drone,
        assessment: result.assessment,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Mission dispatch failed';
      const status = msg.includes('required') || msg.includes('already exists') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });

  app.post('/api/missions/batch-dispatch', requireOperator, async (req: AuthRequest, res) => {
    try {
      const { missions: batchItems } = req.body as {
        missions?: Array<DispatchMissionInput>;
      };
      if (!Array.isArray(batchItems) || batchItems.length === 0) {
        return res
          .status(400)
          .json({ error: 'Provide at least one mission in the batch.' });
      }
      if (batchItems.length > 20) {
        return res
          .status(400)
          .json({ error: 'Batch dispatch supports up to 20 missions at once.' });
      }

      const actorName = req.sessionUser?.name || 'Operator';
      const created: Array<{
        parcel: unknown;
        mission: unknown;
        drone: unknown;
        assessment: unknown;
      }> = [];
      const errors: Array<{ index: number; parcelNumber: string; error: string }> = [];

      for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i];
        try {
          const result = await executeMissionDispatch(item, actorName);
          created.push({
            parcel: result.parcel,
            mission: result.mission,
            drone: result.drone,
            assessment: result.assessment,
          });
        } catch (err: unknown) {
          errors.push({
            index: i,
            parcelNumber: item?.parcelNumber || `#${i + 1}`,
            error: err instanceof Error ? err.message : 'Dispatch error',
          });
        }
      }

      if (created.length === 0) {
        return res.status(400).json({
          error: errors[0]?.error || 'All missions in the batch failed validation.',
          errors,
        });
      }

      broadcast({ type: 'mission:created', batchCount: created.length });
      res.status(201).json({
        created,
        count: created.length,
        errors,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Batch dispatch failed';
      res.status(500).json({ error: msg });
    }
  });

  // --- MISSION LIFECYCLE CONTROLS & EMERGENCY RTB ---

  app.patch('/api/missions/:id/action', requireOperator, async (req: AuthRequest, res) => {
    try {
      const missionId = Number(req.params.id);
      const { action, newDroneId } = req.body as {
        action: 'start' | 'delay' | 'abort' | 'reassign' | 'rtb';
        newDroneId?: number;
      };

      const [mission] = await db
        .select()
        .from(missions)
        .where(eq(missions.id, missionId));

      if (!mission) {
        return res.status(404).json({ error: 'Mission not found' });
      }

      const [parcel] = await db
        .select()
        .from(parcels)
        .where(eq(parcels.id, mission.parcelId));

      let nextStatus = mission.status;
      let nextStage = parcel?.currentStage || 'In Transit';
      let nextDroneId = mission.droneId;
      let logMessage = '';
      let alertEvent: string | null = null;

      if (action === 'start') {
        nextStatus = 'in_transit';
        nextStage = 'In Transit';
        alertEvent = 'Drone Dispatched';
        logMessage = 'Mission launched from Gajularamaram Mother Base.';
        await db
          .update(drones)
          .set({ status: 'busy', altitudeM: 95, speedKmh: 58, updatedAt: new Date() })
          .where(eq(drones.id, mission.droneId));
        if (parcel) {
          await db.insert(deliveryStatuses).values([
            {
              parcelId: parcel.id,
              stage: 'Loaded on Drone',
              note: 'Payload latch locked & telemetry verified',
            },
            {
              parcelId: parcel.id,
              stage: 'In Transit',
              note: 'En route across Hyderabad drone corridor',
            },
          ]);
        }
      } else if (action === 'delay') {
        nextStatus = 'delayed';
        logMessage = 'Mission held by Airspace Traffic Control (+10m window).';
        await db
          .update(missions)
          .set({
            status: 'delayed',
            eta: new Date((mission.eta?.getTime() || Date.now()) + 10 * 60000),
          })
          .where(eq(missions.id, mission.id));
      } else if (action === 'abort') {
        nextStatus = 'aborted';
        logMessage = 'Mission aborted by Command Operator. Drone returned to standby.';
        await db
          .update(drones)
          .set({
            status: 'available',
            currentLat: MOTHER_BASE.lat,
            currentLng: MOTHER_BASE.lng,
            altitudeM: 0,
            speedKmh: 0,
            updatedAt: new Date(),
          })
          .where(eq(drones.id, mission.droneId));
      } else if (action === 'rtb') {
        nextStatus = 'rtb';
        alertEvent = 'Mission Alert';
        logMessage =
          'EMERGENCY RETURN TO BASE triggered! Drone autonomously reversing course to Gajularamaram Hub.';
        await db
          .update(drones)
          .set({
            status: 'available',
            currentLat: MOTHER_BASE.lat,
            currentLng: MOTHER_BASE.lng,
            altitudeM: 40,
            speedKmh: 62,
            updatedAt: new Date(),
          })
          .where(eq(drones.id, mission.droneId));
      } else if (action === 'reassign' && newDroneId) {
        await db
          .update(drones)
          .set({ status: 'available', speedKmh: 0, altitudeM: 0 })
          .where(eq(drones.id, mission.droneId));
        nextDroneId = Number(newDroneId);
        await db
          .update(drones)
          .set({ status: 'busy', updatedAt: new Date() })
          .where(eq(drones.id, nextDroneId));
        logMessage = `Reassigned mission payload to Drone #${nextDroneId}.`;
      }

      const [updatedMission] = await db
        .update(missions)
        .set({
          status: nextStatus,
          droneId: nextDroneId,
          ...(action === 'start' ? { progressPct: Math.max(mission.progressPct, 22) } : {}),
        })
        .where(eq(missions.id, mission.id))
        .returning();

      if (parcel && nextStage !== parcel.currentStage) {
        await db
          .update(parcels)
          .set({ currentStage: nextStage })
          .where(eq(parcels.id, parcel.id));
      }

      const [activeDrone] = await db
        .select()
        .from(drones)
        .where(eq(drones.id, nextDroneId));

      await db.insert(missionLogs).values({
        missionId: mission.id,
        droneCode: activeDrone?.code || 'DRONE',
        eventType: `OPERATOR_${action.toUpperCase()}`,
        message: logMessage,
        actor: req.sessionUser?.name || 'Operator',
      });

      if (alertEvent && parcel) {
        await db.insert(notifications).values({
          parcelNumber: parcel.parcelNumber,
          eventType: alertEvent,
          channel: 'push',
          title: `${alertEvent}: ${parcel.parcelNumber}`,
          message: logMessage,
          recipientTarget: parcel.recipientPhone,
          isRead: false,
        });
      }

      broadcast({ type: 'mission:updated', mission: updatedMission });
      res.json(updatedMission);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Mission action failed';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/missions/batch-action', requireOperator, async (req: AuthRequest, res) => {
    try {
      const { missionIds, action } = req.body as {
        missionIds?: number[];
        action: 'start' | 'delay' | 'abort' | 'rtb';
      };

      if (!Array.isArray(missionIds) || missionIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one mission.' });
      }

      const updatedList = [];
      for (const rawId of missionIds) {
        const missionId = Number(rawId);
        const [mission] = await db
          .select()
          .from(missions)
          .where(eq(missions.id, missionId));
        if (!mission) continue;

        const [parcel] = await db
          .select()
          .from(parcels)
          .where(eq(parcels.id, mission.parcelId));

        let nextStatus = mission.status;
        let nextStage = parcel?.currentStage || 'In Transit';
        let logMessage = '';

        if (action === 'start') {
          nextStatus = 'in_transit';
          nextStage = 'In Transit';
          logMessage = 'Batch launch from Gajularamaram Mother Base.';
          await db
            .update(drones)
            .set({ status: 'busy', altitudeM: 95, speedKmh: 58, updatedAt: new Date() })
            .where(eq(drones.id, mission.droneId));
          if (parcel) {
            await db.insert(deliveryStatuses).values([
              {
                parcelId: parcel.id,
                stage: 'Loaded on Drone',
                note: 'Payload latch locked & telemetry verified',
              },
              {
                parcelId: parcel.id,
                stage: 'In Transit',
                note: 'En route across Hyderabad drone corridor',
              },
            ]);
          }
        } else if (action === 'delay') {
          nextStatus = 'delayed';
          logMessage = 'Batch ATC hold (+10m window).';
        } else if (action === 'abort') {
          nextStatus = 'aborted';
          logMessage = 'Batch mission abort by Command Operator.';
          await db
            .update(drones)
            .set({
              status: 'available',
              currentLat: MOTHER_BASE.lat,
              currentLng: MOTHER_BASE.lng,
              altitudeM: 0,
              speedKmh: 0,
              updatedAt: new Date(),
            })
            .where(eq(drones.id, mission.droneId));
        } else if (action === 'rtb') {
          nextStatus = 'rtb';
          logMessage = 'Batch EMERGENCY RTB triggered.';
          await db
            .update(drones)
            .set({
              status: 'available',
              currentLat: MOTHER_BASE.lat,
              currentLng: MOTHER_BASE.lng,
              altitudeM: 40,
              speedKmh: 62,
              updatedAt: new Date(),
            })
            .where(eq(drones.id, mission.droneId));
        }

        const [updatedMission] = await db
          .update(missions)
          .set({
            status: nextStatus,
            ...(action === 'start' ? { progressPct: Math.max(mission.progressPct, 22) } : {}),
            ...(action === 'delay'
              ? { eta: new Date((mission.eta?.getTime() || Date.now()) + 10 * 60000) }
              : {}),
          })
          .where(eq(missions.id, mission.id))
          .returning();

        if (parcel && nextStage !== parcel.currentStage) {
          await db
            .update(parcels)
            .set({ currentStage: nextStage })
            .where(eq(parcels.id, parcel.id));
        }

        const [activeDrone] = await db
          .select()
          .from(drones)
          .where(eq(drones.id, mission.droneId));

        await db.insert(missionLogs).values({
          missionId: mission.id,
          droneCode: activeDrone?.code || 'DRONE',
          eventType: `OPERATOR_BATCH_${action.toUpperCase()}`,
          message: logMessage,
          actor: req.sessionUser?.name || 'Operator',
        });

        updatedList.push(updatedMission);
      }

      broadcast({ type: 'mission:updated', batchCount: updatedList.length });
      res.json({ updated: updatedList, count: updatedList.length });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Batch mission action failed';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/mission-logs', requireOperator, async (_req, res) => {
    try {
      const logs = await db
        .select()
        .from(missionLogs)
        .orderBy(desc(missionLogs.createdAt))
        .limit(40);
      res.json(logs);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch mission logs';
      res.status(500).json({ error: msg });
    }
  });

  // --- ORACLE AI MISSION PLANNER & AI CHAT SUPPORT ---

  app.post('/api/ai/plan-mission', requireOperator, async (req: AuthRequest, res) => {
    try {
      const { instruction } = req.body as { instruction: string };
      if (!instruction?.trim()) {
        return res.status(400).json({ error: 'Please enter a mission instruction.' });
      }

      const aiPlan = await parseMissionCommandWithAI(instruction);
      const geo = await geocodeDestination(aiPlan.address);
      const distanceKm = haversineKm(
        MOTHER_BASE.lat,
        MOTHER_BASE.lng,
        geo.lat,
        geo.lng
      );

      const allDrones = await db.select().from(drones);
      const suggestedDrone =
        allDrones
          .filter(
            (d) =>
              d.status === 'available' &&
              d.maxPayloadKg >= aiPlan.estimatedWeightKg
          )
          .sort((a, b) => b.batteryPct - a.batteryPct)[0] ||
        allDrones.find((d) => d.status !== 'maintenance') ||
        allDrones[0];

      const [weather] = await db
        .select()
        .from(weatherReports)
        .orderBy(desc(weatherReports.recordedAt))
        .limit(1);

      const assessment = calculateMissionAssessment({
        distanceKm,
        weightKg: aiPlan.estimatedWeightKg,
        windSpeedKmh: weather?.windSpeedKmh ?? 11.4,
        visibilityKm: weather?.visibilityKm ?? 10,
        precipitationMm: weather?.precipitationMm ?? 0,
        droneBatteryPct: suggestedDrone?.batteryPct ?? 90,
        droneHealthPct: suggestedDrone?.healthPct ?? 95,
      });

      res.json({
        extracted: {
          parcelNumber: aiPlan.parcelNumber,
          recipientName: aiPlan.recipientName,
          address: geo.formattedAddress,
          coordinates: { lat: geo.lat, lng: geo.lng },
          deadline: aiPlan.deadlineText,
          priority: aiPlan.priority,
          estimatedWeightKg: aiPlan.estimatedWeightKg,
        },
        report: {
          missionReport: aiPlan.missionReport,
          routeNotes: aiPlan.routeNotes,
          weatherAdvisory: aiPlan.weatherAdvisory,
          distanceKm,
          etaMinutes: assessment.etaMinutes,
          estimatedBatteryPct: assessment.estimatedBatteryPct,
          riskScore: assessment.riskScore,
          successProbability: assessment.successProbability,
        },
        suggestedDrone,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'AI Mission Planner failed';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const {
        message,
        history,
        mode,
        language,
        parcelNumber,
        userLocation,
      } = req.body as {
        message: string;
        history?: ChatTurnInput[];
        mode?: ChatMode;
        language?: string;
        parcelNumber?: string;
        userLocation?: { latitude: number; longitude: number };
      };
      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty.' });
      }

      let parcelContext = '';
      if (parcelNumber) {
        const bundle = await getParcelTrackingBundle(parcelNumber);
        if (bundle) {
          parcelContext = `Parcel ${bundle.parcel.parcelNumber} to ${bundle.parcel.destinationAddress} (${bundle.parcel.destLat}, ${bundle.parcel.destLng}): Stage "${bundle.parcel.currentStage}", Drone ${bundle.drone?.code || 'Assigning'} (${bundle.drone?.batteryPct ?? 90}% battery).`;
        }
      }

      let fleetContext = '';
      if (mode === 'strategist' || mode === 'search' || mode === 'maps') {
        const allDrones = await db.select().from(drones).orderBy(drones.id);
        const [latestWeather] = await db
          .select()
          .from(weatherReports)
          .orderBy(desc(weatherReports.recordedAt))
          .limit(1);
        const fleetSummary = allDrones
          .map(
            (d) =>
              `${d.code}: ${d.status}, battery ${d.batteryPct}%, health ${d.healthPct}%, pos (${d.currentLat}, ${d.currentLng})`
          )
          .join('; ');
        fleetContext = `Hub: Gajularamaram (${MOTHER_BASE.lat}, ${MOTHER_BASE.lng}). Weather: ${latestWeather?.condition || 'Clear Sky'}, wind ${latestWeather?.windSpeedKmh ?? 11.4} km/h, readiness ${latestWeather?.flightReadiness || 'Optimal'}. Fleet: ${fleetSummary}.`;
      }

      const result = await runMultiTurnChatWithAI({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        mode: mode || 'care',
        language: language || 'en',
        parcelContext,
        fleetContext,
        userLocation,
      });

      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'AI Support unavailable';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/ai/maps-grounding', async (req, res) => {
    try {
      const { query, lat, lng, address } = req.body as {
        query: string;
        lat?: number;
        lng?: number;
        address?: string;
      };
      if (!query?.trim()) {
        return res.status(400).json({ error: 'Location query cannot be empty.' });
      }

      let targetLat = typeof lat === 'number' ? lat : undefined;
      let targetLng = typeof lng === 'number' ? lng : undefined;
      let addressLabel = address?.trim() || '';

      if ((targetLat === undefined || targetLng === undefined) && addressLabel) {
        const geo = await geocodeDestination(addressLabel);
        targetLat = geo.lat;
        targetLng = geo.lng;
        addressLabel = geo.formattedAddress;
      }

      const result = await queryMapsGroundingWithAI({
        query: query.trim(),
        lat: targetLat,
        lng: targetLng,
        addressLabel,
      });

      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Google Maps grounding failed';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/ai/search-grounding', async (req, res) => {
    try {
      const { query, focus } = req.body as {
        query: string;
        focus?: 'weather' | 'dgca' | 'corridor';
      };
      if (!query?.trim()) {
        return res.status(400).json({ error: 'Search query cannot be empty.' });
      }

      const result = await querySearchGroundingWithAI({
        query: query.trim(),
        focus,
      });

      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Google Search grounding failed';
      res.status(500).json({ error: msg });
    }
  });

  // --- AUTHORITATIVE REAL-TIME FLIGHT TELEMETRY LOOP ---
  setInterval(async () => {
    if (wss.clients.size === 0) return;
    try {
      await ensureSeeded();
      const activeMissions = await db.select().from(missions);
      const fleet = await db.select().from(drones);

      let updatedAny = false;
      for (const m of activeMissions) {
        if (m.status !== 'in_transit' && m.status !== 'near_destination') continue;

        const waypoints = JSON.parse(m.waypointsJson || '[]') as Array<{
          lat: number;
          lng: number;
          altM: number;
        }>;
        if (waypoints.length < 2) continue;

        const nextProgress = Math.min(100, m.progressPct + 2.5);
        const segFloat = (nextProgress / 100) * (waypoints.length - 1);
        const idx = Math.min(waypoints.length - 2, Math.floor(segFloat));
        const frac = segFloat - idx;
        const p1 = waypoints[idx];
        const p2 = waypoints[idx + 1];
        const lat = Number((p1.lat + (p2.lat - p1.lat) * frac).toFixed(6));
        const lng = Number((p1.lng + (p2.lng - p1.lng) * frac).toFixed(6));
        const altM = Math.round(p1.altM + (p2.altM - p1.altM) * frac);

        let nextStatus = m.status;
        if (nextProgress >= 100) {
          nextStatus = 'delivered';
        } else if (nextProgress >= 75) {
          nextStatus = 'near_destination';
        }

        await db
          .update(missions)
          .set({
            progressPct: nextProgress,
            status: nextStatus,
            ...(nextStatus === 'delivered' ? { completedAt: new Date() } : {}),
          })
          .where(eq(missions.id, m.id));

        const drone = fleet.find((d) => d.id === m.droneId);
        if (drone) {
          await db
            .update(drones)
            .set({
              currentLat: nextStatus === 'delivered' ? MOTHER_BASE.lat : lat,
              currentLng: nextStatus === 'delivered' ? MOTHER_BASE.lng : lng,
              altitudeM: nextStatus === 'delivered' ? 0 : altM,
              speedKmh: nextStatus === 'delivered' ? 0 : 56,
              batteryPct: Math.max(18, drone.batteryPct - (nextProgress % 10 === 0 ? 1 : 0)),
              status: nextStatus === 'delivered' ? 'available' : 'busy',
              updatedAt: new Date(),
            })
            .where(eq(drones.id, drone.id));
        }

        if (nextStatus !== m.status) {
          const [parcel] = await db
            .select()
            .from(parcels)
            .where(eq(parcels.id, m.parcelId));
          if (parcel) {
            const newStage =
              nextStatus === 'delivered' ? 'Delivered' : 'Near Destination';
            await db
              .update(parcels)
              .set({
                currentStage: newStage,
                ...(nextStatus === 'delivered'
                  ? {
                      deliveryProofUrl:
                        '/src/assets/images/delivery_proof_porch_1795193986831.jpg',
                      deliveryProofNote:
                        'Autonomous drop pad release verified · QR OTP sealed',
                    }
                  : {}),
              })
              .where(eq(parcels.id, parcel.id));

            await db.insert(deliveryStatuses).values({
              parcelId: parcel.id,
              stage: newStage,
              note:
                nextStatus === 'delivered'
                  ? 'Parcel released safely at destination drop pad'
                  : 'Drone entering 500m approach perimeter',
            });

            await db.insert(notifications).values({
              parcelNumber: parcel.parcelNumber,
              eventType:
                nextStatus === 'delivered'
                  ? 'Parcel Delivered'
                  : 'Drone Nearing Destination',
              channel: 'push',
              title:
                nextStatus === 'delivered'
                  ? `${parcel.parcelNumber} Delivered`
                  : `${parcel.parcelNumber} Nearing Destination`,
              message:
                nextStatus === 'delivered'
                  ? `Delivery complete at ${parcel.destinationAddress}. Proof photo ready.`
                  : `Drone is approaching ${parcel.destinationAddress}.`,
              recipientTarget: parcel.recipientPhone,
              isRead: false,
            });
          }
        }
        updatedAny = true;
      }

      if (updatedAny) {
        const updatedFleet = await db.select().from(drones).orderBy(drones.id);
        const updatedMissions = await getAllMissionsWithDetails();
        broadcast({
          type: 'telemetry:tick',
          drones: updatedFleet,
          missions: updatedMissions,
        });
        for (const m of updatedMissions) {
          broadcastParcelTick(m.parcelId, m, m.drone || null);
        }
      }
    } catch (err) {
      console.error('Telemetry tick error:', err);
    }
  }, 2500);

  // Vite dev middleware or production static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AEGIS Drone Delivery server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AEGIS server:', err);
  process.exit(1);
});
