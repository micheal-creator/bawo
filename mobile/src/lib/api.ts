import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Conversation, Message, PresenceEntry, User } from './types';

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
  health: () => request<{ ok: boolean; db: string; cache: string; otp: string }>('/health'),

  requestOtp: (phone: string) =>
    request<{ ok: boolean; otpMode: string; devMode: boolean; devCode?: string }>('/auth/request-otp', {
      method: 'POST',
      body: { phone },
    }),

  verifyOtp: (phone: string, code: string, displayName?: string) =>
    request<{ token: string; user: User; devMode: boolean }>('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code, displayName },
    }),

  me: (token: string) => request<{ user: User; online: boolean }>('/me', { token }),

  updateMe: (token: string, body: { displayName?: string; about?: string; avatarUrl?: string }) =>
    request<{ user: User }>('/me', { method: 'PATCH', body, token }),

  contacts: (token: string) => request<{ contacts: User[] }>('/contacts', { token }),

  addContact: (token: string, phone: string, displayName?: string) =>
    request<{ contact: User }>('/contacts', { method: 'POST', body: { phone, displayName }, token }),

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
};
