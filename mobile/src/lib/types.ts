export interface User {
  id: string;
  phone: string;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  mediaUrl: string | null;
  createdAt: string;
  clientId?: string;
  pending?: boolean;
  failed?: boolean;
}

export interface ConversationMember {
  id: string;
  displayName: string;
  phone: string;
  avatarUrl: string | null;
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

export interface PresenceEntry {
  userId: string;
  online: boolean;
  lastSeen: string | null;
}

export interface AuthSession {
  token: string;
  user: User;
}
