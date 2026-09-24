import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { config } from './config.js';
import { verifyToken } from './auth.js';
import {
  isMember,
  insertMessage,
  listConversations,
  markConversationRead,
  markDelivered,
  pendingDeliveries,
  saveDeviceToken,
  conversationIdsForMessages,
} from './store.js';
import { isOnline, lastSeen, markOffline, markOnline } from './redis.js';

interface MessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  mediaUrl: string | null;
  createdAt: string;
  clientId?: string;
}

interface SendMessageInput {
  conversationId: string;
  body: string;
  mediaUrl?: string | null;
  clientId?: string;
}

interface ReadInput {
  conversationId: string;
  upTo?: string;
}

interface TypingInput {
  conversationId: string;
  typing: boolean;
}

interface PresencePayload {
  userId: string;
  online: boolean;
  lastSeen: string | null;
}

interface ServerToClientEvents {
  'message:new': (payload: MessagePayload) => void;
  'message:delivered': (payload: { conversationId: string; messageIds: string[] }) => void;
  'message:read': (payload: { conversationId: string; messageIds: string[] }) => void;
  presence: (payload: PresencePayload) => void;
  typing: (payload: { conversationId: string; userId: string; typing: boolean }) => void;
  error: (payload: { error: string }) => void;
}

interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  'message:send': (
    input: SendMessageInput,
    ack?: (result: { ok: true; message: MessagePayload } | { ok: false; error: string }) => void,
  ) => void;
  'message:delivered': (payload: { messageIds: string[] }) => void;
  'message:read': (input: ReadInput) => void;
  typing: (input: TypingInput) => void;
  'device:register': (input: { token: string; platform: 'ios' | 'android' | 'web' }) => void;
}

interface SocketData {
  userId: string;
  phone: string;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
const userRoom = (userId: string) => `user:${userId}`;

export function createRealtimeServer(httpServer: HttpServer): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: { origin: config.clientOrigin === '*' ? true : config.clientOrigin.split(','), credentials: true },
      transports: ['polling', 'websocket'],
    },
  );

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('missing_token'));
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      next(new Error('invalid_token'));
      return;
    }
    socket.data.userId = payload.sub;
    socket.data.phone = payload.phone;
    next();
  });

  io.on('connection', (socket: AppSocket) => {
    void onConnection(io, socket);
  });

  return io;
}

async function onConnection(io: Server, socket: AppSocket): Promise<void> {
  const userId = socket.data.userId;

  socket.join(userRoom(userId));

  const conversations = await listConversations(userId);
  for (const conversation of conversations) {
    socket.join(conversationRoom(conversation.id));
  }

  await markOnline(userId);
  await broadcastPresence(socket, conversations.map((c) => c.id), { userId, online: true, lastSeen: null });
  await deliverPending(socket, userId);

  socket.on('conversation:join', async (conversationId: string) => {
    if (!(await isMember(conversationId, userId))) {
      socket.emit('error', { error: 'not_a_member' });
      return;
    }
    await socket.join(conversationRoom(conversationId));
  });

  socket.on('conversation:leave', async (conversationId: string) => {
    await socket.leave(conversationRoom(conversationId));
  });

  socket.on('message:send', async (input, ack) => {
    try {
      const body = typeof input?.body === 'string' ? input.body.trim() : '';
      const conversationId = typeof input?.conversationId === 'string' ? input.conversationId : '';
      if (!conversationId || body.length === 0) {
        ack?.({ ok: false, error: 'invalid_message' });
        return;
      }
      if (body.length > 4096) {
        ack?.({ ok: false, error: 'message_too_long' });
        return;
      }
      if (!(await isMember(conversationId, userId))) {
        ack?.({ ok: false, error: 'not_a_member' });
        return;
      }

      const { message, recipientIds } = await insertMessage(
        conversationId,
        userId,
        body,
        input.mediaUrl ?? null,
      );

      const payload: MessagePayload = { ...message, clientId: input.clientId };
      io.to(conversationRoom(conversationId)).emit('message:new', payload);      ack?.({ ok: true, message: payload });

      const online = await onlineRecipients(recipientIds, userId);
      if (online.length > 0) {
        for (const recipientId of online) {
          await markDelivered([message.id], recipientId);
        }
        socket.to(conversationRoom(conversationId)).emit('message:delivered', {
          conversationId,
          messageIds: [message.id],
        });
      }
    } catch (error) {
      console.error('[socket] message:send failed', error);
      ack?.({ ok: false, error: 'server_error' });
    }
  });

  socket.on('message:delivered', async ({ messageIds }) => {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return;
    await markDelivered(messageIds, userId);
    const conversations = await conversationIdsForMessages(messageIds);
    for (const [messageId, conversationId] of conversations) {
      socket.to(conversationRoom(conversationId)).emit('message:delivered', {
        conversationId,
        messageIds: [messageId],
      });
    }
  });

  socket.on('message:read', async ({ conversationId, upTo }) => {
    if (typeof conversationId !== 'string') return;
    if (!(await isMember(conversationId, userId))) return;
    const readIds = await markConversationRead(conversationId, userId, upTo);
    if (readIds.length === 0) return;
    socket.to(conversationRoom(conversationId)).emit('message:read', {
      conversationId,
      messageIds: readIds,
    });
  });

  socket.on('typing', async ({ conversationId, typing }) => {
    if (typeof conversationId !== 'string') return;
    socket.to(conversationRoom(conversationId)).emit('typing', {
      conversationId,
      userId,
      typing: Boolean(typing),
    });
  });

  socket.on('device:register', async ({ token, platform }) => {
    if (typeof token !== 'string' || token.length === 0) return;
    if (platform !== 'ios' && platform !== 'android' && platform !== 'web') return;
    await saveDeviceToken(userId, token, platform);
  });

  socket.on('disconnect', async () => {
    const remaining = await markOffline(userId);
    if (remaining > 0) return;
    const seen = await lastSeen(userId);
    const rooms = await listConversations(userId);
    await broadcastPresence(socket, rooms.map((c) => c.id), { userId, online: false, lastSeen: seen });
  });
}

async function onlineRecipients(recipientIds: string[], senderId: string): Promise<string[]> {
  const others = recipientIds.filter((id) => id !== senderId);
  const results: string[] = [];
  for (const id of others) {
    if (await isOnline(id)) results.push(id);
  }
  return results;
}

async function broadcastPresence(
  socket: AppSocket,
  conversationIds: string[],
  payload: PresencePayload,
): Promise<void> {
  for (const conversationId of conversationIds) {
    socket.to(conversationRoom(conversationId)).emit('presence', payload);
  }
}

async function deliverPending(socket: AppSocket, userId: string): Promise<void> {
  const pending = await pendingDeliveries(userId);
  if (pending.length === 0) return;

  const byConversation = new Map<string, string[]>();
  for (const item of pending) {
    const list = byConversation.get(item.conversationId) ?? [];
    list.push(item.messageId);
    byConversation.set(item.conversationId, list);
  }

  for (const [conversationId, messageIds] of byConversation) {
    await markDelivered(messageIds, userId);
    socket.to(conversationRoom(conversationId)).emit('message:delivered', {
      conversationId,
      messageIds,
    });
  }
}
