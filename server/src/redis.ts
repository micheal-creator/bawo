import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

export const redisSub = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

redis.on('error', (error: Error) => {
  console.error('[redis] error', error.message);
});

redisSub.on('error', (error: Error) => {
  console.error('[redis:sub] error', error.message);
});

const presenceKey = (userId: string) => `bawo:presence:${userId}`;
const lastSeenKey = (userId: string) => `bawo:last_seen:${userId}`;

export async function markOnline(userId: string): Promise<number> {
  const count = await redis.incr(presenceKey(userId));
  await redis.set(lastSeenKey(userId), String(Date.now()));
  return count;
}

export async function markOffline(userId: string): Promise<number> {
  const count = await redis.decr(presenceKey(userId));
  await redis.set(lastSeenKey(userId), String(Date.now()));
  if (count <= 0) {
    await redis.del(presenceKey(userId));
    return 0;
  }
  return count;
}

export async function isOnline(userId: string): Promise<boolean> {
  const value = await redis.get(presenceKey(userId));
  return value !== null && Number.parseInt(value, 10) > 0;
}

export async function onlineAmong(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const values = await redis.mget(userIds.map(presenceKey));
  return userIds.filter((_, index) => {
    const value = values[index];
    return value !== null && value !== undefined && Number.parseInt(value, 10) > 0;
  });
}

export async function lastSeen(userId: string): Promise<string | null> {
  const value = await redis.get(lastSeenKey(userId));
  if (!value) return null;
  return new Date(Number.parseInt(value, 10)).toISOString();
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisSub.quit()]);
}
