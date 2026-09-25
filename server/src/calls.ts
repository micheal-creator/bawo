import { query } from './db.js';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'connected' | 'declined' | 'missed' | 'failed' | 'ended';

export interface CallRecord {
  id: string;
  callerId: string;
  calleeId: string;
  kind: CallKind;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
}

interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  kind: CallKind;
  status: CallStatus;
  started_at: Date;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number;
}

function toCall(row: CallRow): CallRecord {
  return {
    id: row.id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    kind: row.kind,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    answeredAt: row.answered_at ? row.answered_at.toISOString() : null,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    durationSeconds: row.duration_seconds,
  };
}

export async function createCall(
  callerId: string,
  calleeId: string,
  kind: CallKind,
): Promise<CallRecord> {
  const result = await query<CallRow>(
    `INSERT INTO call_log (caller_id, callee_id, kind) VALUES ($1, $2, $3) RETURNING *`,
    [callerId, calleeId, kind],
  );
  const row = result.rows[0];
  if (!row) throw new Error('call_create_failed');
  return toCall(row);
}

export async function getCall(id: string): Promise<CallRecord | null> {
  const result = await query<CallRow>('SELECT * FROM call_log WHERE id = $1', [id]);
  const row = result.rows[0];
  return row ? toCall(row) : null;
}

export async function activeCallForUser(userId: string): Promise<CallRecord | null> {
  const result = await query<CallRow>(
    `SELECT * FROM call_log
     WHERE (caller_id = $1 OR callee_id = $1)
       AND status IN ('ringing', 'connected')
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  return row ? toCall(row) : null;
}

export async function markCallConnected(id: string): Promise<CallRecord | null> {
  await query(
    `UPDATE call_log SET status = 'connected', answered_at = COALESCE(answered_at, now())
     WHERE id = $1 AND status IN ('ringing', 'connected')`,
    [id],
  );
  return getCall(id);
}

export async function endCall(
  id: string,
  status: Exclude<CallStatus, 'ringing'>,
): Promise<CallRecord | null> {
  await query(
    `UPDATE call_log
     SET status = $2,
         ended_at = COALESCE(ended_at, now()),
         duration_seconds = CASE
           WHEN answered_at IS NULL THEN 0
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - answered_at))::int)
         END
     WHERE id = $1 AND status IN ('ringing', 'connected')`,
    [id, status],
  );
  return getCall(id);
}

export async function callHistory(userId: string, limit: number): Promise<CallRecord[]> {
  const result = await query<CallRow>(
    `SELECT * FROM call_log
     WHERE caller_id = $1 OR callee_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(toCall);
}
