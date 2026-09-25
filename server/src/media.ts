import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export interface StoredMedia {
  url: string;
  bytes: number;
  mime: string;
}

export class MediaError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MediaError';
  }
}

export function uploadDir(): string {
  return path.resolve(process.cwd(), config.media.dir);
}

export async function ensureUploadDir(): Promise<void> {
  await mkdir(uploadDir(), { recursive: true });
}

export function parseDataUrl(dataUrl: unknown): { mime: string; buffer: Buffer } | null {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = (match[1] as string).toLowerCase();
  const base64 = (match[2] as string).replace(/\s/g, '');
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (buffer.length === 0) return null;
  return { mime, buffer };
}

export async function storeMedia(dataUrl: unknown): Promise<StoredMedia> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new MediaError('invalid_media');
  const extension = MIME_EXTENSIONS[parsed.mime];
  if (!extension) throw new MediaError('unsupported_media_type');
  if (parsed.buffer.length > config.media.maxBytes) throw new MediaError('media_too_large');

  await ensureUploadDir();
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDir(), filename), parsed.buffer);
  return {
    url: `/media/${filename}`,
    bytes: parsed.buffer.length,
    mime: parsed.mime,
  };
}
