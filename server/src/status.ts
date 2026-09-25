import { config } from './config.js';
import { query } from './db.js';

export interface StatusItem {
  id: string;
  userId: string;
  kind: 'text' | 'image';
  text: string;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number;
}

export interface StatusAuthor {
  id: string;
  displayName: string;
  phone: string;
  nationalPhone: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
}

export interface StatusGroup {
  user: StatusAuthor;
  items: StatusItem[];
  latestAt: string;
  unseenCount: number;
}

export interface StatusViewer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  viewedAt: string;
}

const AUDIENCE_SQL = `
  SELECT $1::uuid AS user_id
  UNION
  SELECT c.contact_id FROM contacts c WHERE c.owner_id = $1::uuid
  UNION
  SELECT peer.user_id
  FROM conversation_members mine
  JOIN conversations conv ON conv.id = mine.conversation_id AND conv.kind = 'direct'
  JOIN conversation_members peer ON peer.conversation_id = conv.id AND peer.user_id <> $1::uuid
  WHERE mine.user_id = $1::uuid
`;

export async function createStatus(
  userId: string,
  input: { kind: 'text' | 'image'; text: string; mediaUrl: string | null },
): Promise<StatusItem> {
  const result = await query<{
    id: string;
    user_id: string;
    kind: 'text' | 'image';
    text: string;
    media_url: string | null;
    created_at: Date;
    expires_at: Date;
    viewed: boolean;
    view_count: string;
  }>(
    `INSERT INTO user_status (user_id, kind, text, media_url, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5::int))
     RETURNING id, user_id, kind, text, media_url, created_at, expires_at,
               false AS viewed, 0 AS view_count`,
    [userId, input.kind, input.text, input.mediaUrl, config.statusTtlHours],
  );
  const row = result.rows[0];
  if (!row) throw new Error('status_create_failed');
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    text: row.text,
    mediaUrl: row.media_url,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    viewed: false,
    viewCount: 0,
  };
}

export async function listStatusFeed(viewerId: string): Promise<StatusGroup[]> {
  const result = await query<{
    user_id: string;
    display_name: string;
    phone: string;
    national_phone: string | null;
    country_code: string | null;
    avatar_url: string | null;
    items: unknown;
    latest_at: Date;
    unseen_count: string;
  }>(
    `SELECT u.id AS user_id,
            u.display_name,
            u.phone,
            u.national_phone,
            u.country_code,
            u.avatar_url,
            feed.items,
            feed.latest_at,
            COALESCE(unseen.count, 0) AS unseen_count
     FROM (
       SELECT s.user_id,
              json_agg(
                json_build_object(
                  'id', s.id,
                  'userId', s.user_id,
                  'kind', s.kind,
                  'text', s.text,
                  'mediaUrl', s.media_url,
                  'createdAt', s.created_at,
                  'expiresAt', s.expires_at,
                  'viewed', (v.viewer_id IS NOT NULL),
                  'viewCount', (SELECT count(*) FROM status_views sv WHERE sv.status_id = s.id)
                ) ORDER BY s.created_at ASC
              ) AS items,
              max(s.created_at) AS latest_at
       FROM user_status s
       LEFT JOIN status_views v ON v.status_id = s.id AND v.viewer_id = $1::uuid
       WHERE s.expires_at > now()
         AND s.user_id IN (${AUDIENCE_SQL})
       GROUP BY s.user_id
     ) feed
     JOIN users u ON u.id = feed.user_id
     LEFT JOIN LATERAL (
       SELECT count(*) AS count
       FROM user_status s2
       WHERE s2.user_id = feed.user_id
         AND s2.expires_at > now()
         AND NOT EXISTS (
           SELECT 1 FROM status_views v2
           WHERE v2.status_id = s2.id AND v2.viewer_id = $1::uuid
         )
     ) unseen ON TRUE
     ORDER BY (feed.user_id = $1::uuid) DESC, feed.latest_at DESC`,
    [viewerId],
  );

  return result.rows.map((row) => ({
    user: {
      id: row.user_id,
      displayName: row.display_name,
      phone: row.phone,
      nationalPhone: row.national_phone,
      countryCode: row.country_code,
      avatarUrl: row.avatar_url,
    },
    items: row.items as StatusItem[],
    latestAt: row.latest_at.toISOString(),
    unseenCount: Number.parseInt(row.unseen_count, 10),
  }));
}

export async function canViewStatus(viewerId: string, statusId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM user_status s
     WHERE s.id = $2::uuid
       AND s.expires_at > now()
       AND s.user_id IN (${AUDIENCE_SQL})`,
    [viewerId, statusId],
  );
  return result.rowCount === 1;
}

export async function markStatusViewed(statusId: string, viewerId: string): Promise<void> {
  await query(
    `INSERT INTO status_views (status_id, viewer_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [statusId, viewerId],
  );
}

export async function statusViewers(statusId: string): Promise<StatusViewer[]> {
  const result = await query<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    viewed_at: Date;
  }>(
    `SELECT u.id, u.display_name, u.avatar_url, v.viewed_at
     FROM status_views v
     JOIN users u ON u.id = v.viewer_id
     WHERE v.status_id = $1
     ORDER BY v.viewed_at DESC`,
    [statusId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    viewedAt: row.viewed_at.toISOString(),
  }));
}

export async function deleteStatus(statusId: string, userId: string): Promise<boolean> {
  const result = await query('DELETE FROM user_status WHERE id = $1 AND user_id = $2', [
    statusId,
    userId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function statusOwner(statusId: string): Promise<string | null> {
  const result = await query<{ user_id: string }>('SELECT user_id FROM user_status WHERE id = $1', [
    statusId,
  ]);
  return result.rows[0]?.user_id ?? null;
}
