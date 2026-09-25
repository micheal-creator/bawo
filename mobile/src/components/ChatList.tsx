import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../lib/api';
import { dayLabel, initials } from '../lib/format';
import { formatDisplay } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';
import type { Conversation } from '../lib/types';

function conversationTitle(conversation: Conversation, userId: string): string {
  if (conversation.kind === 'group') return conversation.title ?? 'Group';
  const peer = conversation.members.find((member) => member.id !== userId);
  return peer?.displayName ?? 'Unknown';
}

function preview(conversation: Conversation): string {
  const message = conversation.lastMessage;
  if (!message) return 'No messages yet';
  return message.mediaUrl ? '📎 Attachment' : message.body;
}

export function ChatList() {
  const router = useRouter();
  const { token, user, socket } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { conversations: list } = await api.conversations(token);
      setConversations(list);

      const memberIds = Array.from(
        new Set(
          list
            .filter((conversation) => conversation.kind === 'direct')
            .flatMap((conversation) => conversation.members.map((member) => member.id))
            .filter((id) => id !== user?.id),
        ),
      );
      if (memberIds.length > 0) {
        const { presence } = await api.presence(token, memberIds);
        setOnline((current) => {
          const next = { ...current };
          for (const entry of presence) next[entry.userId] = entry.online;
          return next;
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!socket) return;
    const onMessage = () => void load();
    const onPresence = (payload: { userId: string; online: boolean }) =>
      setOnline((current) => ({ ...current, [payload.userId]: payload.online }));

    socket.on('message:new', onMessage);
    socket.on('presence', onPresence);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('presence', onPresence);
    };
  }, [socket, load]);

  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const left = a.lastMessage?.createdAt ?? a.createdAt;
        const right = b.lastMessage?.createdAt ?? b.createdAt;
        return right.localeCompare(left);
      }),
    [conversations],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => item.id}
      contentContainerStyle={sorted.length === 0 ? styles.emptyContainer : styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyText}>Start a conversation from the button above.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const peer = item.kind === 'direct' ? item.members.find((m) => m.id !== user?.id) : undefined;
        const isOnline = peer ? online[peer.id] === true : false;
        return (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(conversationTitle(item, user?.id ?? ''))}</Text>
              {item.kind === 'direct' && isOnline ? <View style={styles.onlineDot} /> : null}
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {conversationTitle(item, user?.id ?? '')}
              </Text>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {preview(item)}
              </Text>
            </View>
            <View style={styles.rowMeta}>
              {item.unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unreadCount}</Text>
                </View>
              ) : null}
              {item.lastMessage ? (
                <Text style={styles.rowTime}>{dayLabel(item.lastMessage.createdAt)}</Text>
              ) : null}
              {peer ? (
                <Text style={styles.rowNumber} numberOfLines={1}>
                  {formatDisplay(peer.phone, peer.nationalPhone)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  listContent: { paddingVertical: spacing.sm },
  emptyContainer: { flexGrow: 1 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowPreview: { color: colors.textMuted, fontSize: 13 },
  rowMeta: { alignItems: 'flex-end', gap: 3, maxWidth: 110 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#04150F', fontSize: 12, fontWeight: '700' },
  rowTime: { color: colors.textMuted, fontSize: 11 },
  rowNumber: { color: colors.primary, fontSize: 10 },
});
