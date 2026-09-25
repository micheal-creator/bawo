import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  CallRecord,
  Community,
  CommunityPost,
  Conversation,
  Listing,
  Message,
  PresenceEntry,
  StatusGroup,
  StatusItem,
  StatusViewer,
  User,
} from './types';

function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const fromConfig = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

export const API_URL = defaultApiUrl().replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

export function mediaUri(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

const PICKER_UPLOAD = '/media';

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : {};

  if (!response.ok) {
    const code = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `http_${response.status}`;
    throw new ApiError(response.status, code);
  }

  return payload as T;
}

export const api = {
  health: () => request<{ ok: boolean; db: string; cache: string; otp: string; rev: string }>('/health'),

  requestOtp: (phone: string, countryCode?: string) =>
    request<{
      ok: boolean;
      otpMode: string;
      devMode: boolean;
      devCode?: string;
      phone: string;
      nationalPhone: string;
      countryCode: string;
    }>('/auth/request-otp', { method: 'POST', body: { phone, countryCode } }),

  verifyOtp: (phone: string, code: string, displayName?: string, countryCode?: string) =>
    request<{ token: string; user: User; devMode: boolean }>('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code, displayName, countryCode },
    }),

  me: (token: string) => request<{ user: User; online: boolean }>('/me', { token }),

  updateMe: (token: string, body: { displayName?: string; about?: string; avatarUrl?: string }) =>
    request<{ user: User }>('/me', { method: 'PATCH', body, token }),

  contacts: (token: string) => request<{ contacts: User[] }>('/contacts', { token }),

  addContact: (token: string, phone: string, displayName?: string, countryCode?: string) =>
    request<{ contact: User }>('/contacts', {
      method: 'POST',
      body: { phone, displayName, countryCode },
      token,
    }),

  syncContacts: (token: string, phones: string[]) =>
    request<{ matched: User[] }>('/contacts/sync', { method: 'POST', body: { phones }, token }),

  conversations: (token: string) =>
    request<{ conversations: Conversation[] }>('/conversations', { token }),

  startDirect: (token: string, input: { phone?: string; userId?: string }) =>
    request<{ conversationId: string }>('/conversations/direct', { method: 'POST', body: input, token }),

  createGroup: (token: string, title: string, memberIds: string[]) =>
    request<{ conversationId: string }>('/conversations/group', {
      method: 'POST',
      body: { title, memberIds },
      token,
    }),

  messages: (token: string, conversationId: string, limit = 50, before?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return request<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages?${params.toString()}`,
      { token },
    );
  },

  presence: (token: string, userIds: string[]) => {
    const params = new URLSearchParams({ userIds: userIds.join(',') });
    return request<{ presence: PresenceEntry[] }>(`/presence?${params.toString()}`, { token });
  },

  registerDevice: (token: string, deviceToken: string, platform: 'ios' | 'android' | 'web') =>
    request<{ ok: boolean }>('/devices', { method: 'POST', body: { token: deviceToken, platform }, token }),

  uploadMedia: (token: string, dataUrl: string) =>
    request<{ url: string; bytes: number; mime: string }>(PICKER_UPLOAD, {
      method: 'POST',
      body: { dataUrl },
      token,
    }),

  status: {
    feed: (token: string) => request<{ groups: StatusGroup[] }>('/status', { token }),
    create: (token: string, body: { text?: string; mediaUrl?: string | null }) =>
      request<{ status: StatusItem }>('/status', { method: 'POST', body, token }),
    view: (token: string, statusId: string) =>
      request<{ ok: boolean }>(`/status/${statusId}/view`, { method: 'POST', token }),
    viewers: (token: string, statusId: string) =>
      request<{ viewers: StatusViewer[] }>(`/status/${statusId}/viewers`, { token }),
    remove: (token: string, statusId: string) =>
      request<{ ok: boolean }>(`/status/${statusId}`, { method: 'DELETE', token }),
  },

  communities: {
    list: (token: string, mine = false) =>
      request<{ communities: Community[] }>(`/communities${mine ? '?mine=true' : ''}`, { token }),
    create: (token: string, name: string, description: string) =>
      request<{ community: Community }>('/communities', {
        method: 'POST',
        body: { name, description },
        token,
      }),
    get: (token: string, id: string) =>
      request<{ community: Community; memberIds: string[] }>(`/communities/${id}`, { token }),
    join: (token: string, id: string) =>
      request<{ ok: boolean }>(`/communities/${id}/join`, { method: 'POST', token }),
    leave: (token: string, id: string) =>
      request<{ ok: boolean }>(`/communities/${id}/leave`, { method: 'POST', token }),
    posts: (token: string, id: string) =>
      request<{ posts: CommunityPost[] }>(`/communities/${id}/posts`, { token }),
    post: (token: string, id: string, body: string, mediaUrl?: string | null, announcement?: boolean) =>
      request<{ post: CommunityPost }>(`/communities/${id}/posts`, {
        method: 'POST',
        body: { body, mediaUrl, announcement },
        token,
      }),
  },

  shop: {
    list: (token: string, mine = false) =>
      request<{ listings: Listing[] }>(`/shop/listings${mine ? '?mine=true' : ''}`, { token }),
    create: (
      token: string,
      input: {
        title: string;
        description?: string;
        priceCents: number;
        currency?: string;
        location?: string | null;
        mediaUrl?: string | null;
      },
    ) => request<{ listing: Listing }>('/shop/listings', { method: 'POST', body: input, token }),
    get: (token: string, id: string) =>
      request<{ listing: Listing }>(`/shop/listings/${id}`, { token }),
    setStatus: (token: string, id: string, status: 'active' | 'sold' | 'archived') =>
      request<{ listing: Listing }>(`/shop/listings/${id}`, {
        method: 'PATCH',
        body: { status },
        token,
      }),
    remove: (token: string, id: string) =>
      request<{ ok: boolean }>(`/shop/listings/${id}`, { method: 'DELETE', token }),
    contact: (token: string, id: string) =>
      request<{ conversationId: string }>(`/shop/listings/${id}/contact`, { method: 'POST', token }),
  },

  calls: {
    config: (token: string) =>
      request<{ iceServers: { urls: string | string[]; username?: string; credential?: string }[] }>(
        '/calls/config',
        { token },
      ),
    history: (token: string) => request<{ calls: CallRecord[] }>('/calls', { token }),
  },
};
