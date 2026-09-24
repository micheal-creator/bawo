import { Redis } from 'ioredis';
import { config } from './config.js';

export interface KeyValueStore {
  readonly kind: 'redis' | 'memory';
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  mget(keys: string[]): Promise<(string | null)[]>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

class MemoryStore implements KeyValueStore {
  readonly kind = 'memory' as const;
  private entries = new Map<string, MemoryEntry>();

  private live(key: string): MemoryEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async incr(key: string): Promise<number> {
    const current = this.live(key);
    const next = (current ? Number.parseInt(current.value, 10) : 0) + 1;
    this.entries.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return next;
  }

  async decr(key: string): Promise<number> {
    const current = this.live(key);
    const next = (current ? Number.parseInt(current.value, 10) : 0) - 1;
    if (next <= 0) {
      this.entries.delete(key);
      return 0;
    }
    this.entries.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return next;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? null : Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return keys.map((key) => this.live(key)?.value ?? null);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

class RedisStore implements KeyValueStore {
  readonly kind = 'redis' as const;

  constructor(private readonly client: Redis) {}

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) await this.client.set(key, value);
    else await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.client.mget(keys);
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

function createStore(): KeyValueStore {
  if (!config.redisUrl) {
    console.warn('[redis] REDIS_URL not set, using in-memory presence and OTP store');
    return new MemoryStore();
  }

  const client = new Redis(config.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  client.on('error', (error: Error) => {
    console.error('[redis] error', error.message);
  });

  return new RedisStore(client);
}

export const kv: KeyValueStore = createStore();

const presenceKey = (userId: string) => `bawo:presence:${userId}`;
const lastSeenKey = (userId: string) => `bawo:last_seen:${userId}`;

export async function markOnline(userId: string): Promise<number> {
  const count = await kv.incr(presenceKey(userId));
  await kv.set(lastSeenKey(userId), String(Date.now()));
  return count;
}

export async function markOffline(userId: string): Promise<number> {
  const count = await kv.decr(presenceKey(userId));
  await kv.set(lastSeenKey(userId), String(Date.now()));
  return count;
}

export async function isOnline(userId: string): Promise<boolean> {
  const value = await kv.get(presenceKey(userId));
  return value !== null && Number.parseInt(value, 10) > 0;
}

export async function onlineAmong(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const values = await kv.mget(userIds.map(presenceKey));
  return userIds.filter((_, index) => {
    const value = values[index];
    return value !== null && value !== undefined && Number.parseInt(value, 10) > 0;
  });
}

export async function lastSeen(userId: string): Promise<string | null> {
  const value = await kv.get(lastSeenKey(userId));
  if (!value) return null;
  return new Date(Number.parseInt(value, 10)).toISOString();
}

export async function closeRedis(): Promise<void> {
  await kv.close();
}
