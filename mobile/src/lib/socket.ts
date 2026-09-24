import { io, type Socket } from 'socket.io-client';
import type { Message } from './types';

export interface ServerToClientEvents {
  'message:new': (payload: Message) => void;
  'message:delivered': (payload: { conversationId: string; messageIds: string[] }) => void;
  'message:read': (payload: { conversationId: string; messageIds: string[] }) => void;
  presence: (payload: { userId: string; online: boolean; lastSeen: string | null }) => void;
  typing: (payload: { conversationId: string; userId: string; typing: boolean }) => void;
  error: (payload: { error: string }) => void;
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
