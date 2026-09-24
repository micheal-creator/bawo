import { Router, type NextFunction, type Request, type Response } from 'express';
import { config, isDevOtp } from './config.js';
import { authMiddleware, issueToken, normalizePhone, requestOtp, verifyOtp } from './auth.js';
import { isOnline, kv, lastSeen, onlineAmong } from './redis.js';
import { query } from './db.js';
import {
  addContact,
  createGroupConversation,
  findOrCreateDirectConversation,
  findUsersByPhones,
  getUserById,
  isMember,
  listContacts,
  listConversations,
  listMessages,
  removeDeviceToken,
  saveDeviceToken,
  updateProfile,
  upsertUserByPhone,
} from './store.js';
import type { AuthedRequest } from './auth.js';

type Handler = (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req as AuthedRequest, res, next).catch(next);
  };
}

function currentUser(req: AuthedRequest): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error('unauthenticated');
  return userId;
}

export const router = Router();

router.get('/health', asyncHandler(async (_req, res) => {
  let db = 'down';
  try {
    await query('SELECT 1');
    db = 'postgres';
  } catch {
    db = 'down';
  }
  let cache = 'down';
  try {
    cache = (await kv.ping()) ? kv.kind : 'down';
  } catch {
    cache = 'down';
  }
  res.json({ ok: db === 'postgres', db, cache, otp: config.otp.mode, env: config.env });
}));

router.post('/auth/request-otp', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const { devCode } = await requestOtp(phone);
  res.json({
    ok: true,
    phone,
    otpMode: config.otp.mode,
    expiresInSeconds: config.otp.ttlSeconds,
    ...(devCode ? { devMode: true, devCode } : { devMode: false }),
  });
}));

router.post('/auth/verify-otp', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const ok = await verifyOtp(phone, req.body?.code);
  if (!ok) {
    res.status(401).json({ error: 'invalid_code' });
    return;
  }
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : undefined;
  const user = await upsertUserByPhone(phone, displayName);
  const token = issueToken({ sub: user.id, phone: user.phone });
  res.json({ token, user, devMode: isDevOtp });
}));

router.use(authMiddleware);

router.get('/me', asyncHandler(async (req, res) => {
  const user = await getUserById(currentUser(req));
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({ user, online: await isOnline(user.id) });
}));

router.patch('/me', asyncHandler(async (req, res) => {
  const user = await updateProfile(currentUser(req), {
    displayName: typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : undefined,
    about: typeof req.body?.about === 'string' ? req.body.about.trim() : undefined,
    avatarUrl: typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl : undefined,
  });
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({ user });
}));

router.get('/contacts', asyncHandler(async (req, res) => {
  res.json({ contacts: await listContacts(currentUser(req)) });
}));

router.post('/contacts', asyncHandler(async (req, res) => {
  const ownerId = currentUser(req);
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const contact = await upsertUserByPhone(phone, typeof req.body?.displayName === 'string' ? req.body.displayName : undefined);
  if (contact.id === ownerId) {
    res.status(400).json({ error: 'cannot_add_self' });
    return;
  }
  await addContact(ownerId, contact.id);
  res.status(201).json({ contact });
}));

router.post('/contacts/sync', asyncHandler(async (req, res) => {
  const phones = Array.isArray(req.body?.phones)
    ? req.body.phones
        .map((value: unknown) => normalizePhone(value))
        .filter((value: string | null): value is string => value !== null)
    : [];
  const ownerId = currentUser(req);
  const users = (await findUsersByPhones(phones)).filter((user) => user.id !== ownerId);
  for (const user of users) {
    await addContact(ownerId, user.id);
  }
  res.json({ matched: users });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  res.json({ conversations: await listConversations(currentUser(req)) });
}));

router.post('/conversations/direct', asyncHandler(async (req, res) => {
  const ownerId = currentUser(req);
  const phone = normalizePhone(req.body?.phone);
  let peerId = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (!peerId && phone) {
    const peer = await upsertUserByPhone(phone);
    peerId = peer.id;
  }
  if (!peerId || peerId === ownerId) {
    res.status(400).json({ error: 'invalid_peer' });
    return;
  }
  const conversationId = await findOrCreateDirectConversation(ownerId, peerId);
  res.status(201).json({ conversationId });
}));

router.post('/conversations/group', asyncHandler(async (req, res) => {
  const ownerId = currentUser(req);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const memberIds: string[] = Array.isArray(req.body?.memberIds)
    ? req.body.memberIds.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  if (title.length === 0 || memberIds.length === 0) {
    res.status(400).json({ error: 'invalid_group' });
    return;
  }
  const conversationId = await createGroupConversation(ownerId, title, memberIds);
  res.status(201).json({ conversationId });
}));

router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const conversationId = req.params.id as string;
  if (!(await isMember(conversationId, userId))) {
    res.status(403).json({ error: 'not_a_member' });
    return;
  }
  const limitRaw = Number.parseInt(String(req.query.limit ?? '50'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  res.json({ messages: await listMessages(conversationId, limit, before) });
}));

router.get('/presence', asyncHandler(async (req, res) => {
  const ids = String(req.query.userIds ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (ids.length === 0) {
    res.json({ presence: [] });
    return;
  }
  const online = await onlineAmong(ids);
  const onlineSet = new Set(online);
  res.json({
    presence: await Promise.all(
      ids.map(async (userId) => ({
        userId,
        online: onlineSet.has(userId),
        lastSeen: onlineSet.has(userId) ? null : await lastSeen(userId),
      })),
    ),
  });
}));

router.post('/devices', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const platform = req.body?.platform;
  if (token.length === 0 || (platform !== 'ios' && platform !== 'android' && platform !== 'web')) {
    res.status(400).json({ error: 'invalid_device' });
    return;
  }
  await saveDeviceToken(userId, token, platform);
  res.status(201).json({ ok: true });
}));

router.delete('/devices', asyncHandler(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (token.length === 0) {
    res.status(400).json({ error: 'invalid_device' });
    return;
  }
  await removeDeviceToken(currentUser(req), token);
  res.json({ ok: true });
}));
