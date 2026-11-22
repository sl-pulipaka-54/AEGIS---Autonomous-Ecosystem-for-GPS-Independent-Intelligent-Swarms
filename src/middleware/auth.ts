import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export interface SessionUser {
  uid: string;
  email: string;
  phone?: string;
  name: string;
  role: 'customer' | 'operator';
}

export interface ParcelSession {
  parcelId: number;
  parcelNumber: string;
  recipientName: string;
  exp: number;
}

export interface AuthRequest extends Request {
  sessionUser?: SessionUser;
  parcelSession?: ParcelSession;
}

export function signSessionToken(payload: SessionUser): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `aegis.${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  if (!token.startsWith('aegis.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionUser;
  } catch {
    return null;
  }
}

export function signParcelToken(payload: Omit<ParcelSession, 'exp'>): string {
  const fullPayload: ParcelSession = {
    ...payload,
    exp: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`parcel:${encoded}`)
    .digest('base64url');
  return `aegis-parcel.${encoded}.${sig}`;
}

export function verifyParcelToken(token: string): ParcelSession | null {
  if (!token.startsWith('aegis-parcel.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`parcel:${encoded}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as ParcelSession;
    if (!parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function resolveUserFromToken(token: string): Promise<SessionUser | null> {
  const local = verifySessionToken(token);
  if (local) return local;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@aegis-user.local`,
      name: decoded.name || decoded.email?.split('@')[0] || 'AEGIS Customer',
      role: 'customer',
    };
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const user = await resolveUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
  req.sessionUser = user;
  next();
};

export const requireOperator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await requireAuth(req, res, () => {
    if (req.sessionUser?.role !== 'operator') {
      return res.status(403).json({ error: 'Forbidden: Operator clearance required' });
    }
    next();
  });
};

export const requireParcelAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const parcelHeader =
    (req.headers['x-parcel-token'] as string | undefined) ||
    (req.headers.authorization?.startsWith('Bearer aegis-parcel.')
      ? req.headers.authorization.slice('Bearer '.length).trim()
      : undefined);

  if (!parcelHeader) {
    return res.status(401).json({ error: 'Parcel OTP verification required' });
  }
  const session = verifyParcelToken(parcelHeader);
  if (!session) {
    return res.status(401).json({ error: 'Parcel verification expired. Please re-verify OTP.' });
  }
  req.parcelSession = session;
  next();
};
