import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'aegis-hyderabad-airspace-session-key-2026';

export interface SessionUser {
  uid: string;
  email: string;
  phone?: string;
  name: string;
  role: 'customer' | 'operator';
}

export interface AuthRequest extends Request {
  sessionUser?: SessionUser;
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
