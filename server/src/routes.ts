import { Router, type NextFunction, type Request, type Response } from 'express';
import { config, isDevOtp } from './config.js';
import { authMiddleware, issueToken, requestOtp, verifyOtp } from './auth.js';
import { isOnline, kv, lastSeen, onlineAmong } from './redis.js';
import { query } from './db.js';
import { countryByCode, defaultCountry, resolvePhoneInput, type PhoneInput } from './phone.js';
import { storeMedia, MediaError } from './media.js';
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
  upsertUserFromInput,
} from './store.js';
import {
  canViewStatus,
  createStatus,
  deleteStatus,
  listStatusFeed,
  markStatusViewed,
  statusOwner,
  statusViewers,
} from './status.js';
import {
  communityMemberIds,
  communityRole,
  createCommunity,
  createCommunityPost,
  getCommunity,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listCommunityPosts,
} from './community.js';
import {
  createListing,
  deleteListing,
  getListing,
  listListings,
  updateListingStatus,
} from './shop.js';
import { callHistory } from './calls.js';
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

function resolveIncomingPhone(body: unknown): PhoneInput | null {
  const payload = (body ?? {}) as { phone?: unknown; national?: unknown; countryCode?: unknown };
  const raw = typeof payload.phone === 'string' ? payload.phone : typeof payload.national === 'string' ? payload.national : '';
  if (raw.trim().length === 0) return null;
  const code = typeof payload.countryCode === 'string' ? payload.countryCode : null;
  const fallback = countryByCode(code) ?? defaultCountry();
  return resolvePhoneInput(raw, fallback);
}

function iceServers() {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: config.ice.stunUrls },
  ];
  if (config.ice.turnUrl) {
    servers.push({
      urls: config.ice.turnUrl,
      ...(config.ice.turnUsername ? { username: config.ice.turnUsername } : {}),
      ...(config.ice.turnCredential ? { credential: config.ice.turnCredential } : {}),
    });
  }
  return servers;
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
  res.json({
    ok: db === 'postgres',
    db,
    cache,
    otp: config.otp.mode,
    env: config.env,
    rev: (process.env.RENDER_GIT_COMMIT ?? 'dev').slice(0, 7),
  });
}));

router.post('/auth/request-otp', asyncHandler(async (req, res) => {
  const resolved = resolveIncomingPhone(req.body);
  if (!resolved) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const { devCode } = await requestOtp(resolved.e164);
  res.json({
    ok: true,
    phone: resolved.e164,
    nationalPhone: resolved.nationalPhone,
    countryCode: resolved.countryCode,
    otpMode: config.otp.mode,
    expiresInSeconds: config.otp.ttlSeconds,
    ...(devCode ? { devMode: true, devCode } : { devMode: false }),
  });
}));

router.post('/auth/verify-otp', asyncHandler(async (req, res) => {
  const resolved = resolveIncomingPhone(req.body);
  if (!resolved) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const ok = await verifyOtp(resolved.e164, req.body?.code);
  if (!ok) {
    res.status(401).json({ error: 'invalid_code' });
    return;
  }
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : undefined;
  const user = await upsertUserFromInput(resolved, displayName);
  const token = issueToken({ sub: user.id, phone: user.phone });
  res.json({ token, user, devMode: isDevOtp });
}));

router.use(authMiddleware);

router.get('/calls/config', asyncHandler(async (_req, res) => {
  res.json({ iceServers: iceServers() });
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
  const resolved = resolveIncomingPhone(req.body);
  if (!resolved) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : undefined;
  const contact = await upsertUserFromInput(resolved, displayName);
  if (contact.id === ownerId) {
    res.status(400).json({ error: 'cannot_add_self' });
    return;
  }
  await addContact(ownerId, contact.id, {
    nationalPhone: resolved.nationalPhone,
    countryCode: resolved.countryCode,
  });
  res.status(201).json({
    contact: {
      ...contact,
      nationalPhone: resolved.nationalPhone,
      countryCode: resolved.countryCode,
    },
  });
}));

router.post('/contacts/sync', asyncHandler(async (req, res) => {
  const ownerId = currentUser(req);
  const countryCode = typeof req.body?.countryCode === 'string' ? req.body.countryCode : null;
  const fallback = countryByCode(countryCode) ?? defaultCountry();
  const raw: unknown[] = Array.isArray(req.body?.phones) ? req.body.phones : [];
  const resolved = raw
    .map((value) => (typeof value === 'string' ? resolvePhoneInput(value, fallback) : null))
    .filter((value): value is PhoneInput => value !== null);

  const users = (await findUsersByPhones(resolved.map((item) => item.e164))).filter(
    (user) => user.id !== ownerId,
  );
  const byPhone = new Map(resolved.map((item) => [item.e164, item]));
  for (const user of users) {
    const local = byPhone.get(user.phone);
    await addContact(ownerId, user.id, {
      nationalPhone: local?.nationalPhone ?? null,
      countryCode: local?.countryCode ?? null,
    });
  }
  res.json({ matched: users });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  res.json({ conversations: await listConversations(currentUser(req)) });
}));

router.post('/conversations/direct', asyncHandler(async (req, res) => {
  const ownerId = currentUser(req);
  const resolved = resolveIncomingPhone(req.body);
  let peerId = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (!peerId && resolved) {
    const peer = await upsertUserFromInput(resolved);
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

router.post('/media', asyncHandler(async (req, res) => {
  try {
    const stored = await storeMedia(req.body?.dataUrl);
    res.status(201).json(stored);
  } catch (error) {
    if (error instanceof MediaError) {
      res.status(400).json({ error: error.code });
      return;
    }
    throw error;
  }
}));

router.post('/status', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : null;
  const kind = mediaUrl ? 'image' : 'text';
  if (text.length === 0 && !mediaUrl) {
    res.status(400).json({ error: 'empty_status' });
    return;
  }
  if (text.length > 700) {
    res.status(400).json({ error: 'status_too_long' });
    return;
  }
  const status = await createStatus(userId, { kind, text, mediaUrl });
  res.status(201).json({ status });
}));

router.get('/status', asyncHandler(async (req, res) => {
  res.json({ groups: await listStatusFeed(currentUser(req)) });
}));

router.post('/status/:id/view', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const statusId = req.params.id as string;
  if (!(await canViewStatus(userId, statusId))) {
    res.status(403).json({ error: 'not_visible' });
    return;
  }
  await markStatusViewed(statusId, userId);
  res.json({ ok: true });
}));

router.get('/status/:id/viewers', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const statusId = req.params.id as string;
  const owner = await statusOwner(statusId);
  if (!owner) {
    res.status(404).json({ error: 'status_not_found' });
    return;
  }
  if (owner !== userId) {
    res.status(403).json({ error: 'not_owner' });
    return;
  }
  res.json({ viewers: await statusViewers(statusId) });
}));

router.delete('/status/:id', asyncHandler(async (req, res) => {
  const removed = await deleteStatus(req.params.id as string, currentUser(req));
  if (!removed) {
    res.status(404).json({ error: 'status_not_found' });
    return;
  }
  res.json({ ok: true });
}));

router.get('/communities', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const onlyMine = req.query.mine === 'true';
  res.json({ communities: await listCommunities(userId, onlyMine) });
}));

router.post('/communities', asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (name.length < 3 || name.length > 60) {
    res.status(400).json({ error: 'invalid_name' });
    return;
  }
  try {
    const community = await createCommunity(currentUser(req), name, description);
    res.status(201).json({ community });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'name_taken' });
      return;
    }
    throw error;
  }
}));

router.get('/communities/:id', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const community = await getCommunity(userId, req.params.id as string);
  if (!community) {
    res.status(404).json({ error: 'community_not_found' });
    return;
  }
  res.json({ community, memberIds: await communityMemberIds(community.id) });
}));

router.post('/communities/:id/join', asyncHandler(async (req, res) => {
  const joined = await joinCommunity(currentUser(req), req.params.id as string);
  if (!joined) {
    res.status(404).json({ error: 'community_not_found' });
    return;
  }
  res.json({ ok: true });
}));

router.post('/communities/:id/leave', asyncHandler(async (req, res) => {
  await leaveCommunity(currentUser(req), req.params.id as string);
  res.json({ ok: true });
}));

router.get('/communities/:id/posts', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const communityId = req.params.id as string;
  if ((await communityRole(userId, communityId)) === null) {
    res.status(403).json({ error: 'not_a_member' });
    return;
  }
  const limitRaw = Number.parseInt(String(req.query.limit ?? '50'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  res.json({ posts: await listCommunityPosts(communityId, limit) });
}));

router.post('/communities/:id/posts', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const communityId = req.params.id as string;
  const role = await communityRole(userId, communityId);
  if (role === null) {
    res.status(403).json({ error: 'not_a_member' });
    return;
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : null;
  const wantsAnnouncement = req.body?.announcement === true;
  if (body.length === 0 && !mediaUrl) {
    res.status(400).json({ error: 'empty_post' });
    return;
  }
  if (wantsAnnouncement && role !== 'admin') {
    res.status(403).json({ error: 'not_admin' });
    return;
  }
  const post = await createCommunityPost(communityId, userId, body, mediaUrl, wantsAnnouncement);
  res.status(201).json({ post });
}));

router.get('/shop/listings', asyncHandler(async (req, res) => {
  const sellerId = req.query.mine === 'true' ? currentUser(req) : undefined;
  const limitRaw = Number.parseInt(String(req.query.limit ?? '50'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  res.json({
    listings: await listListings({
      sellerId,
      includeArchived: sellerId !== undefined,
      limit,
    }),
  });
}));

router.post('/shop/listings', asyncHandler(async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : 'NGN';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : null;
  const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : null;
  const priceRaw = Number.parseInt(String(req.body?.priceCents ?? '0'), 10);
  const priceCents = Number.isFinite(priceRaw) ? Math.max(0, priceRaw) : 0;
  if (title.length < 3 || title.length > 120) {
    res.status(400).json({ error: 'invalid_title' });
    return;
  }
  if (currency.length !== 3) {
    res.status(400).json({ error: 'invalid_currency' });
    return;
  }
  const listing = await createListing(currentUser(req), {
    title,
    description,
    priceCents,
    currency,
    location,
    mediaUrl,
  });
  res.status(201).json({ listing });
}));

router.get('/shop/listings/:id', asyncHandler(async (req, res) => {
  const listing = await getListing(req.params.id as string);
  if (!listing) {
    res.status(404).json({ error: 'listing_not_found' });
    return;
  }
  res.json({ listing });
}));

router.patch('/shop/listings/:id', asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (status !== 'active' && status !== 'sold' && status !== 'archived') {
    res.status(400).json({ error: 'invalid_status' });
    return;
  }
  const listing = await updateListingStatus(req.params.id as string, currentUser(req), status);
  if (!listing) {
    res.status(404).json({ error: 'listing_not_found' });
    return;
  }
  res.json({ listing });
}));

router.delete('/shop/listings/:id', asyncHandler(async (req, res) => {
  const removed = await deleteListing(req.params.id as string, currentUser(req));
  if (!removed) {
    res.status(404).json({ error: 'listing_not_found' });
    return;
  }
  res.json({ ok: true });
}));

router.post('/shop/listings/:id/contact', asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const listing = await getListing(req.params.id as string);
  if (!listing) {
    res.status(404).json({ error: 'listing_not_found' });
    return;
  }
  if (listing.sellerId === userId) {
    res.status(400).json({ error: 'cannot_contact_self' });
    return;
  }
  const conversationId = await findOrCreateDirectConversation(userId, listing.sellerId);
  res.status(201).json({ conversationId });
}));

router.get('/calls', asyncHandler(async (req, res) => {
  const limitRaw = Number.parseInt(String(req.query.limit ?? '50'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  res.json({ calls: await callHistory(currentUser(req), limit) });
}));
