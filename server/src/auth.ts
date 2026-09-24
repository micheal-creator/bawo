import { randomInt, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, isDevOtp } from './config.js';
import { redis } from './redis.js';

export interface AuthPayload {
  sub: string;
  phone: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

const otpKey = (phone: string) => `bawo:otp:${phone}`;

export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) return null;
  return cleaned;
}

export function issueToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === 'string') return null;
    const sub = decoded.sub;
    const phone = (decoded as { phone?: unknown }).phone;
    if (typeof sub !== 'string' || typeof phone !== 'string') return null;
    return { sub, phone };
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function requestOtp(phone: string): Promise<{ devCode?: string }> {
  const code = isDevOtp ? config.otp.devCode : String(randomInt(100000, 999999));
  await redis.set(otpKey(phone), code, 'EX', config.otp.ttlSeconds);
  return isDevOtp ? { devCode: code } : {};
}

export async function verifyOtp(phone: string, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || code.length === 0) return false;
  const stored = await redis.get(otpKey(phone));
  if (stored === null) return false;
  const ok = safeEqual(stored, code);
  if (ok) await redis.del(otpKey(phone));
  return ok;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }
  (req as AuthedRequest).user = payload;
  next();
}
