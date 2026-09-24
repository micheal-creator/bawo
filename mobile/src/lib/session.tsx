import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, API_URL } from './api';
import { connectSocket, type BawoSocket } from './socket';
import type { AuthSession, User } from './types';

const TOKEN_KEY = 'bawo.token';

interface SessionContextValue {
  ready: boolean;
  token: string | null;
  user: User | null;
  socket: BawoSocket | null;
  connected: boolean;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function readStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function writeStoredToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token === null) globalThis.localStorage?.removeItem(TOKEN_KEY);
    else globalThis.localStorage?.setItem(TOKEN_KEY, token);
    return;
  }
  if (token === null) await SecureStore.deleteItemAsync(TOKEN_KEY);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [socket, setSocket] = useState<BawoSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<BawoSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const stored = await readStoredToken();
      if (!stored) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const { user: me } = await api.me(stored);
        if (cancelled) return;
        setToken(stored);
        setUser(me);
      } catch {
        await writeStoredToken(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      return;
    }

    const next = connectSocket(API_URL, token);
    socketRef.current = next;
    setSocket(next);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    next.on('connect', onConnect);
    next.on('disconnect', onDisconnect);

    return () => {
      next.off('connect', onConnect);
      next.off('disconnect', onDisconnect);
      next.disconnect();
      if (socketRef.current === next) socketRef.current = null;
    };
  }, [token]);

  const signIn = useCallback(async (session: AuthSession) => {
    await writeStoredToken(session.token);
    setUser(session.user);
    setToken(session.token);
  }, []);

  const signOut = useCallback(async () => {
    await writeStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const { user: me } = await api.me(token);
    setUser(me);
  }, [token]);

  const updateUser = useCallback((next: User) => setUser(next), []);

  const value = useMemo<SessionContextValue>(
    () => ({ ready, token, user, socket, connected, signIn, signOut, refreshUser, updateUser }),
    [ready, token, user, socket, connected, signIn, signOut, refreshUser, updateUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
