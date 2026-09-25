import process from 'node:process';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  port: int('PORT', 4000),
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${int('PORT', 4000)}`,
  clientOrigin: process.env.CLIENT_ORIGIN ?? '*',

  databaseUrl: required('DATABASE_URL', 'postgres://bawo:bawo@localhost:5432/bawo'),
  databaseSsl: bool('DATABASE_SSL', false),

  redisUrl: process.env.REDIS_URL?.trim() || null,

  jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',

  otp: {
    mode: (process.env.OTP_MODE ?? 'dev') as 'dev' | 'sms',
    ttlSeconds: int('OTP_CODE_TTL_SECONDS', 300),
    devCode: process.env.OTP_DEV_CODE ?? '123456',
  },

  media: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxBytes: int('UPLOAD_MAX_BYTES', 5 * 1024 * 1024),
  },

  ice: {
    stunUrls: (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    turnUrl: process.env.TURN_URL?.trim() || null,
    turnUsername: process.env.TURN_USERNAME?.trim() || null,
    turnCredential: process.env.TURN_CREDENTIAL?.trim() || null,
  },

  statusTtlHours: int('STATUS_TTL_HOURS', 24),
} as const;

export const isDevOtp = config.otp.mode === 'dev';

export function corsOrigins(): string[] {
  const raw = config.clientOrigin.trim();
  if (raw === '*' || raw === '') return ['*'];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function resolveCorsOrigin(requestOrigin: string | undefined): string | null {
  const allowed = corsOrigins();
  if (allowed.includes('*')) return requestOrigin ?? null;
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  return null;
}
