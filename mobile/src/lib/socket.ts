import { io, type Socket } from 'socket.io-client';
import type { CallKind, CallPeer, CallRecord, Message } from './types';

export interface CallInvite {
  call: CallRecord;
  peer: CallPeer;
}

export interface CallEnded {
  callId: string;
  status: CallRecord['status'];
  durationSeconds: number;
}

export interface CallSignal {
  callId: string;
  from: string;
  payload: unknown;
}

export interface ServerToClientEvents {
  'message:new': (payload: Message) => void;
  'message:delivered': (payload: { conversationId: string; messageIds: string[] }) => void;
  'message:read': (payload: { conversationId: string; messageIds: string[] }) => void;
  presence: (payload: { userId: string; online: boolean; lastSeen: string | null }) => void;
  typing: (payload: { conversationId: string; userId: string; typing: boolean }) => void;
  error: (payload: { error: string }) => void;
  'call:incoming': (payload: CallInvite) => void;
  'call:accepted': (payload: CallInvite) => void;
  'call:declined': (payload: { callId: string }) => void;
  'call:ended': (payload: CallEnded) => void;
  'call:signal': (payload: CallSignal) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  'message:send': (
    input: { conversationId: string; body: string; mediaUrl?: string | null; clientId?: string },
    ack?: (result: { ok: true; message: Message } | { ok: false; error: string }) => void,
  ) => void;
  'message:delivered': (payload: { messageIds: string[] }) => void;
  'message:read': (input: { conversationId: string; upTo?: string }) => void;
  typing: (input: { conversationId: string; typing: boolean }) => void;
  'device:register': (input: { token: string; platform: 'ios' | 'android' | 'web' }) => void;
  'call:start': (
    input: { calleeId: string; kind: CallKind },
    ack?: (
      result: { ok: true; call: CallRecord } | { ok: false; error: string; call?: CallRecord },
    ) => void,
  ) => void;
  'call:accept': (input: { callId: string }) => void;
  'call:decline': (input: { callId: string }) => void;
  'call:end': (input: { callId: string }) => void;
  'call:signal': (input: { callId: string; payload: unknown }) => void;
}

export type BawoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function connectSocket(apiUrl: string, token: string): BawoSocket {
  return io(apiUrl, {
    auth: { token },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
}
