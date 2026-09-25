import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';
import type { CallKind } from '../lib/types';

function RootNavigator() {
  const { ready, token, socket } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const activeCallRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const onLoginScreen = pathname === '/';
    if (!token && !onLoginScreen) router.replace('/');
    if (token && onLoginScreen) router.replace('/chats');
  }, [ready, token, pathname, router]);

  useEffect(() => {
    if (ready && token) return;
    activeCallRef.current = null;
  }, [ready, token]);

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: { call: { id: string; kind: CallKind }; peer: { id: string; displayName: string; phone: string } }) => {
      const callId = payload.call.id;
      if (activeCallRef.current === callId) return;
      activeCallRef.current = callId;
      const kind = payload.call.kind === 'video' ? 'video' : 'audio';
      const name = encodeURIComponent(payload.peer.displayName ?? '');
      const phone = encodeURIComponent(payload.peer.phone ?? '');
      router.push(`/call/${payload.peer.id}?kind=${kind}&incoming=${callId}&name=${name}&phone=${phone}`);
    };

    const onCleared = () => {
      activeCallRef.current = null;
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:ended', onCleared);
    socket.on('call:declined', onCleared);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:ended', onCleared);
      socket.off('call:declined', onCleared);
    };
  }, [socket, router]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="chats" options={{ title: 'bawo' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
      <Stack.Screen name="group-create" options={{ title: 'New group' }} />
      <Stack.Screen name="status-compose" options={{ title: 'New status', presentation: 'modal' }} />
      <Stack.Screen name="status/[userId]" options={{ title: 'Status' }} />
      <Stack.Screen name="community/[id]" options={{ title: 'Community' }} />
      <Stack.Screen name="shop-create" options={{ title: 'Sell' }} />
      <Stack.Screen name="shop/[id]" options={{ title: 'Listing' }} />
      <Stack.Screen name="call/[peerId]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
