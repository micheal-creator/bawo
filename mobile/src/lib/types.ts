export interface User {
  id: string;
  phone: string;
  nationalPhone: string | null;
  countryCode: string | null;
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
  nationalPhone: string | null;
  countryCode: string | null;
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

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  sellerNationalPhone: string | null;
  sellerCountryCode: string | null;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  location: string | null;
  mediaUrl: string | null;
  status: 'active' | 'sold' | 'archived';
  createdAt: string;
}

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

export interface CallPeer {
  id: string;
  displayName: string;
  phone: string;
  nationalPhone: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
}
