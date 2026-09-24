import { query } from './db.js';

export interface User {
  id: string;
  phone: string;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface Conversation {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  createdBy: string | null;
  createdAt: string;
  members: ConversationMember[];
  lastMessage: Message | null;
  unreadCount: number;
}

export interface ConversationMember {
  id: string;
  displayName: string;
  phone: string;
  avatarUrl: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  mediaUrl: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  phone: string;
  display_name: string;
  about: string;
  avatar_url: string | null;
  created_at: Date;
  last_seen_at: Date;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    phone: row.phone,
    displayName: row.display_name,
    about: row.about,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    mediaUrl: row.media_url,
    createdAt: row.created_at.toISOString(),
  };
}

export async function upsertUserByPhone(phone: string, displayName?: string): Promise<User> {
  const result = await query<UserRow>(
    `INSERT INTO users (phone, display_name)
     VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE
       SET last_seen_at = now(),
           display_name = CASE
             WHEN users.display_name = '' OR users.display_name = users.phone
               THEN COALESCE(NULLIF($2, ''), users.display_name)
             ELSE users.display_name
           END
     RETURNING *`,
    [phone, displayName ?? phone],
  );
  const row = result.rows[0];
  if (!row) throw new Error('user_upsert_failed');
  return toUser(row);
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export async function findUsersByPhones(phones: string[]): Promise<User[]> {
  if (phones.length === 0) return [];
  const result = await query<UserRow>('SELECT * FROM users WHERE phone = ANY($1::text[])', [phones]);
  return result.rows.map(toUser);
}

export async function updateProfile(
  id: string,
  fields: { displayName?: string; about?: string; avatarUrl?: string | null },
): Promise<User | null> {
  const result = await query<UserRow>(
    `UPDATE users
     SET display_name = COALESCE($2, display_name),
         about = COALESCE($3, about),
         avatar_url = COALESCE($4, avatar_url)
     WHERE id = $1
     RETURNING *`,
    [id, fields.displayName ?? null, fields.about ?? null, fields.avatarUrl ?? null],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export async function listContacts(ownerId: string): Promise<User[]> {
  const result = await query<UserRow>(
    `SELECT u.* FROM contacts c
     JOIN users u ON u.id = c.contact_id
     WHERE c.owner_id = $1
     ORDER BY u.display_name ASC`,
    [ownerId],
  );
  return result.rows.map(toUser);
}

export async function addContact(ownerId: string, contactId: string): Promise<void> {
  if (ownerId === contactId) return;
  await query(
    `INSERT INTO contacts (owner_id, contact_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [ownerId, contactId],
  );
}

export async function findOrCreateDirectConversation(a: string, b: string): Promise<string> {
  const directKey = [a, b].sort().join(':');
  const existing = await query<{ id: string }>(
    'SELECT id FROM conversations WHERE direct_key = $1',
    [directKey],
  );
  const found = existing.rows[0];
  if (found) return found.id;

  const created = await query<{ id: string }>(
    `INSERT INTO conversations (kind, direct_key, created_by)
     VALUES ('direct', $1, $2)
     ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
     RETURNING id`,
    [directKey, a],
  );
  const conversationId = created.rows[0]?.id;
  if (!conversationId) throw new Error('conversation_create_failed');

  await query(
    `INSERT INTO conversation_members (conversation_id, user_id)
     VALUES ($1, $2), ($1, $3)
     ON CONFLICT DO NOTHING`,
    [conversationId, a, b],
  );
  return conversationId;
}

export async function createGroupConversation(
  ownerId: string,
  title: string,
  memberIds: string[],
): Promise<string> {
  const created = await query<{ id: string }>(
    `INSERT INTO conversations (kind, title, created_by) VALUES ('group', $1, $2) RETURNING id`,
    [title, ownerId],
  );
  const conversationId = created.rows[0]?.id;
  if (!conversationId) throw new Error('conversation_create_failed');

  const unique = Array.from(new Set([ownerId, ...memberIds]));
  await query(
    `INSERT INTO conversation_members (conversation_id, user_id, role)
     SELECT $1, unnest($2::uuid[]), 'member'
     ON CONFLICT DO NOTHING`,
    [conversationId, unique],
  );
  await query(
    `UPDATE conversation_members SET role = 'admin' WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, ownerId],
  );
  return conversationId;
}

export async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  return result.rowCount === 1;
}

export async function memberIds(conversationId: string): Promise<string[]> {
  const result = await query<{ user_id: string }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
    [conversationId],
  );
  return result.rows.map((row) => row.user_id);
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const rows = await query<{
    id: string;
    kind: 'direct' | 'group';
    title: string | null;
    created_by: string | null;
    created_at: Date;
    members: unknown;
    last_message: unknown;
    unread_count: string;
  }>(
    `SELECT c.id,
            c.kind,
            c.title,
            c.created_by,
            c.created_at,
            COALESCE(members.list, '[]'::json) AS members,
            last_msg.message AS last_message,
            COALESCE(unread.count, 0) AS unread_count
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
                'id', u.id,
                'displayName', u.display_name,
                'phone', u.phone,
                'avatarUrl', u.avatar_url
              ) ORDER BY u.display_name) AS list
       FROM conversation_members cm2
       JOIN users u ON u.id = cm2.user_id
       WHERE cm2.conversation_id = c.id
     ) members ON TRUE
     LEFT JOIN LATERAL (
       SELECT json_build_object(
                'id', m.id,
                'conversationId', m.conversation_id,
                'senderId', m.sender_id,
                'body', m.body,
                'mediaUrl', m.media_url,
                'createdAt', m.created_at
              ) AS message
       FROM messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) last_msg ON TRUE
     LEFT JOIN LATERAL (
       SELECT count(*) AS count
       FROM messages m
       WHERE m.conversation_id = c.id
         AND m.sender_id <> $1
         AND NOT EXISTS (
           SELECT 1 FROM message_receipts r
           WHERE r.message_id = m.id AND r.user_id = $1 AND r.read_at IS NOT NULL
         )
     ) unread ON TRUE
     ORDER BY COALESCE((last_msg.message ->> 'createdAt')::timestamptz, c.created_at) DESC`,
    [userId],
  );

  return rows.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    members: row.members as ConversationMember[],
    lastMessage: row.last_message as Message | null,
    unreadCount: Number.parseInt(row.unread_count, 10),
  }));
}

export interface InsertedMessage {
  message: Message;
  recipientIds: string[];
}

export async function insertMessage(
  conversationId: string,
  senderId: string,
  body: string,
  mediaUrl: string | null,
): Promise<InsertedMessage> {
  const inserted = await query<MessageRow>(
    `INSERT INTO messages (conversation_id, sender_id, body, media_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [conversationId, senderId, body, mediaUrl],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error('message_insert_failed');

  const recipients = await memberIds(conversationId);
  const others = recipients.filter((id) => id !== senderId);
  if (others.length > 0) {
    await query(
      `INSERT INTO message_receipts (message_id, user_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [row.id, others],
    );
  }

  return { message: toMessage(row), recipientIds: recipients };
}

export async function listMessages(
  conversationId: string,
  limit: number,
  before?: string,
): Promise<Message[]> {
  const result = await query<MessageRow>(
    `SELECT * FROM messages
     WHERE conversation_id = $1
       AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit, before ?? null],
  );
  return result.rows.map(toMessage).reverse();
}

export async function markDelivered(messageIds: string[], userId: string): Promise<number> {
  if (messageIds.length === 0) return 0;
  const result = await query(
    `UPDATE message_receipts
     SET delivered_at = COALESCE(delivered_at, now())
     WHERE user_id = $2 AND message_id = ANY($1::uuid[])`,
    [messageIds, userId],
  );
  return result.rowCount ?? 0;
}

export interface PendingDelivery {
  messageId: string;
  conversationId: string;
  senderId: string;
}

export async function conversationIdsForMessages(
  messageIds: string[],
): Promise<Map<string, string>> {
  if (messageIds.length === 0) return new Map();
  const result = await query<{ id: string; conversation_id: string }>(
    'SELECT id, conversation_id FROM messages WHERE id = ANY($1::uuid[])',
    [messageIds],
  );
  return new Map(result.rows.map((row) => [row.id, row.conversation_id]));
}

export async function pendingDeliveries(userId: string): Promise<PendingDelivery[]> {
  const result = await query<{ message_id: string; conversation_id: string; sender_id: string }>(
    `SELECT r.message_id, m.conversation_id, m.sender_id
     FROM message_receipts r
     JOIN messages m ON m.id = r.message_id
     WHERE r.user_id = $1 AND r.delivered_at IS NULL`,
    [userId],
  );
  return result.rows.map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
  }));
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
  upTo?: string,
): Promise<string[]> {
  const result = await query<{ message_id: string }>(
    `UPDATE message_receipts r
     SET read_at = COALESCE(r.read_at, now())
     FROM messages m
     WHERE r.message_id = m.id
       AND m.conversation_id = $1
       AND r.user_id = $2
       AND r.read_at IS NULL
       AND ($3::timestamptz IS NULL OR m.created_at <= $3::timestamptz)
     RETURNING r.message_id`,
    [conversationId, userId, upTo ?? null],
  );
  return result.rows.map((row) => row.message_id);
}

export async function saveDeviceToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  await query(
    `INSERT INTO device_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()`,
    [userId, token, platform],
  );
}

export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await query('DELETE FROM device_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
}

export async function deviceTokensFor(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const result = await query<{ token: string }>(
    'SELECT token FROM device_tokens WHERE user_id = ANY($1::uuid[])',
    [userIds],
  );
  return result.rows.map((row) => row.token);
}
