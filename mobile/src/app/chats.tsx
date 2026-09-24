import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../lib/api';
import { normalizeNational, toE164, detectCountry } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';
import type { Conversation } from '../lib/types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

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

export default function ChatsScreen() {
  const router = useRouter();
  const { token, user, socket, signOut } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [phoneInput, setPhoneInput] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupPhones, setGroupPhones] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { conversations: list } = await api.conversations(token);
      setConversations(list);
      setError(null);

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
    } catch {
      setError('Could not load your chats.');
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

  const startDirect = async () => {
    if (!token) return;
    const country = detectCountry();
    const normalized = phoneInput.trim().startsWith('+')
      ? phoneInput.trim()
      : toE164(country, normalizeNational(phoneInput));
    if (!normalized) {
      setFormError('Enter a valid phone number.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const { conversationId } = await api.startDirect(token, { phone: normalized });
      setMenuOpen(false);
      setPhoneInput('');
      await load();
      router.push(`/chat/${conversationId}`);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.code : 'Failed to start chat');
    } finally {
      setBusy(false);
    }
  };

  const startGroup = async () => {
    if (!token) return;
    const country = detectCountry();
    const phones = groupPhones
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => (value.startsWith('+') ? value : toE164(country, normalizeNational(value))))
      .filter((value): value is string => value !== null);

    if (groupTitle.trim().length === 0 || phones.length === 0) {
      setFormError('Add a group name and at least one phone number.');
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const members = await Promise.all(
        phones.map(async (phone) => (await api.addContact(token, phone)).contact.id),
      );
      const { conversationId } = await api.createGroup(token, groupTitle.trim(), members);
      setMenuOpen(false);
      setGroupTitle('');
      setGroupPhones('');
      await load();
      router.push(`/chat/${conversationId}`);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.code : 'Failed to create group');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
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
            <Text style={styles.emptyText}>Start a conversation with the button below.</Text>
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
              </View>
            </Pressable>
          );
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={() => { setMode('direct'); setMenuOpen(true); }}>
          <Text style={styles.actionButtonText}>New chat</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => { setMode('group'); setMenuOpen(true); }}>
          <Text style={styles.actionButtonText}>New group</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {user?.displayName ?? ''} · {socket?.connected ? 'connected' : 'offline'}
        </Text>
        <Pressable onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <Modal visible={menuOpen} animationType="slide" transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{mode === 'direct' ? 'New chat' : 'New group'}</Text>

            {mode === 'direct' ? (
              <TextInput
                style={styles.input}
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="+2348012345678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                autoFocus
              />
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={groupTitle}
                  onChangeText={setGroupTitle}
                  placeholder="Group name"
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  style={styles.input}
                  value={groupPhones}
                  onChangeText={setGroupPhones}
                  placeholder="+2348012345678, +2348098765432"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </>
            )}

            {formError ? <Text style={styles.error}>{formError}</Text> : null}

            <Pressable
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => void (mode === 'direct' ? startDirect() : startGroup())}
            >
              {busy ? (
                <ActivityIndicator color="#04150F" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'direct' ? 'Start chat' : 'Create group'}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
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
  rowMeta: { alignItems: 'flex-end' },
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
  actions: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionButtonText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  footerText: { color: colors.textMuted, fontSize: 12 },
  signOut: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.lg },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#04150F', fontSize: 16, fontWeight: '700' },
});
