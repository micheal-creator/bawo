import { query } from './db.js';

export interface Community {
  id: string;
  name: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
  memberCount: number;
  postCount: number;
  joined: boolean;
  role: 'member' | 'admin' | null;
}

export interface CommunityPost {
  id: string;
  communityId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  mediaUrl: string | null;
  isAnnouncement: boolean;
  createdAt: string;
}

interface CommunityRow {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: Date;
  member_count: string;
  post_count: string;
  role: 'member' | 'admin' | null;
}

function toCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    memberCount: Number.parseInt(row.member_count, 10),
    postCount: Number.parseInt(row.post_count, 10),
    joined: row.role !== null,
    role: row.role,
  };
}

const COMMUNITY_SELECT = `
  SELECT c.id,
         c.name,
         c.description,
         c.created_by,
         c.created_at,
         (SELECT count(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
         (SELECT count(*) FROM community_posts p WHERE p.community_id = c.id) AS post_count,
         (SELECT m.role FROM community_members m WHERE m.community_id = c.id AND m.user_id = $1) AS role
  FROM communities c
`;

export async function listCommunities(userId: string, onlyMine: boolean): Promise<Community[]> {
  const result = await query<CommunityRow>(
    `${COMMUNITY_SELECT}
     ${onlyMine ? 'WHERE EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = $1)' : ''}
     ORDER BY member_count DESC, c.created_at DESC
     LIMIT 200`,
    [userId],
  );
  return result.rows.map(toCommunity);
}

export async function getCommunity(userId: string, communityId: string): Promise<Community | null> {
  const result = await query<CommunityRow>(`${COMMUNITY_SELECT} WHERE c.id = $2`, [
    userId,
    communityId,
  ]);
  const row = result.rows[0];
  return row ? toCommunity(row) : null;
}

export async function createCommunity(
  userId: string,
  name: string,
  description: string,
): Promise<Community> {
  const created = await query<{ id: string }>(
    `INSERT INTO communities (name, description, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [name, description, userId],
  );
  const id = created.rows[0]?.id;
  if (!id) throw new Error('community_create_failed');
  await query(
    `INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'admin')
     ON CONFLICT DO NOTHING`,
    [id, userId],
  );
  const community = await getCommunity(userId, id);
  if (!community) throw new Error('community_create_failed');
  return community;
}

export async function joinCommunity(userId: string, communityId: string): Promise<boolean> {
  const exists = await query('SELECT 1 FROM communities WHERE id = $1', [communityId]);
  if (exists.rowCount !== 1) return false;
  await query(
    `INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [communityId, userId],
  );
  return true;
}

export async function leaveCommunity(userId: string, communityId: string): Promise<void> {
  await query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [
    communityId,
    userId,
  ]);
}

export async function communityRole(
  userId: string,
  communityId: string,
): Promise<'member' | 'admin' | null> {
  const result = await query<{ role: 'member' | 'admin' }>(
    'SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2',
    [communityId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function listCommunityPosts(
  communityId: string,
  limit: number,
): Promise<CommunityPost[]> {
  const result = await query<{
    id: string;
    community_id: string;
    author_id: string;
    author_name: string;
    author_avatar_url: string | null;
    body: string;
    media_url: string | null;
    is_announcement: boolean;
    created_at: Date;
  }>(
    `SELECT p.id,
            p.community_id,
            p.author_id,
            u.display_name AS author_name,
            u.avatar_url AS author_avatar_url,
            p.body,
            p.media_url,
            p.is_announcement,
            p.created_at
     FROM community_posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.community_id = $1
     ORDER BY p.is_announcement DESC, p.created_at DESC
     LIMIT $2`,
    [communityId, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    communityId: row.community_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    body: row.body,
    mediaUrl: row.media_url,
    isAnnouncement: row.is_announcement,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createCommunityPost(
  communityId: string,
  authorId: string,
  body: string,
  mediaUrl: string | null,
  isAnnouncement: boolean,
): Promise<CommunityPost> {
  const result = await query<{ id: string; created_at: Date }>(
    `INSERT INTO community_posts (community_id, author_id, body, media_url, is_announcement)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [communityId, authorId, body, mediaUrl, isAnnouncement],
  );
  const row = result.rows[0];
  if (!row) throw new Error('post_create_failed');
  return {
    id: row.id,
    communityId,
    authorId,
    authorName: '',
    authorAvatarUrl: null,
    body,
    mediaUrl,
    isAnnouncement,
    createdAt: row.created_at.toISOString(),
  };
}

export async function communityMemberIds(communityId: string): Promise<string[]> {
  const result = await query<{ user_id: string }>(
    'SELECT user_id FROM community_members WHERE community_id = $1',
    [communityId],
  );
  return result.rows.map((row) => row.user_id);
}
