import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { colors, spacing } from '../../lib/theme';
import type { Conversation, Message } from '../../lib/types';

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString();
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = typeof params.id === 'string' ? params.id : '';
  const { token, user, socket } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const peer = useMemo(
    () => conversation?.members.find((member) => member.id !== user?.id),
    [conversation, user?.id],
  );

  const load = useCallback(async () => {
    if (!token || !conversationId) return;
    try {
      const [{ messages: history }, { conversations }] = await Promise.all([
        api.messages(token, conversationId),
        api.conversations(token),
      ]);
      setMessages(history);
      setConversation(conversations.find((item) => item.id === conversationId) ?? null);
      setError(null);
      if (history.length > 0) socket?.emit('message:read', { conversationId });
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.code : 'Could not load this chat.');
    } finally {
      setLoading(false);
    }
  }, [token, conversationId, socket]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('conversation:join', conversationId);

    const onNew = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((current) => {
        const withoutOptimistic = current.filter(
          (item) => !(item.pending && message.clientId && item.clientId === message.clientId),
        );
        if (withoutOptimistic.some((item) => item.id === message.id)) return withoutOptimistic;
        return [...withoutOptimistic, message];
      });
      if (message.senderId !== user?.id) {
        socket.emit('message:read', { conversationId, upTo: message.createdAt });
      }
    };

    const onRead = (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
    };

    const onTyping = (payload: { conversationId: string; userId: string; typing: boolean }) => {
      if (payload.conversationId !== conversationId || payload.userId === user?.id) return;
      setPeerTyping(payload.typing);
    };

    const onPresence = (payload: { userId: string; online: boolean }) => {
      if (peer && payload.userId === peer.id) setPeerOnline(payload.online);
    };

    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);

    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.off('typing', onTyping);
      socket.off('presence', onPresence);
      socket.emit('conversation:leave', conversationId);
    };
  }, [socket, conversationId, user?.id, peer]);

  useEffect(() => {
    if (!token || !peer) return;
    void api
      .presence(token, [peer.id])
      .then(({ presence }) => {
        const entry = presence[0];
        if (entry) setPeerOnline(entry.online);
      })
      .catch(() => undefined);
  }, [token, peer]);

  const send = () => {
    const body = draft.trim();
    if (!body || !socket || !token) return;

    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: Message = {
      id: clientId,
      conversationId,
      senderId: user?.id ?? 'me',
      body,
      mediaUrl: null,
      createdAt: new Date().toISOString(),
      clientId,
      pending: true,
    };

    setMessages((current) => [...current, optimistic]);
    setDraft('');
    socket.emit('typing', { conversationId, typing: false });

    socket.emit('message:send', { conversationId, body, clientId }, (result) => {
      if (result.ok) {
        setMessages((current) =>
          current.map((item) => (item.id === clientId ? { ...result.message, clientId } : item)),
        );
      } else {
        setMessages((current) =>
          current.map((item) => (item.id === clientId ? { ...item, pending: false, failed: true } : item)),
        );
        setError(`Message failed: ${result.error}`);
      }
    });
  };

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!socket) return;
    socket.emit('typing', { conversationId, typing: value.length > 0 });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing', { conversationId, typing: false });
    }, 2000);
  };

  const headerStatus = peerTyping
    ? 'typing…'
    : conversation?.kind === 'group'
      ? `${conversation.members.length} members`
      : peerOnline
        ? 'online'
        : 'offline';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{headerStatus}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => {
          const mine = item.senderId === user?.id;
          const previous = messages[index - 1];
          const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(item.createdAt);
          return (
            <View>
              {showDay ? <Text style={styles.dayLabel}>{dayLabel(item.createdAt)}</Text> : null}
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={styles.bubbleText}>{item.body}</Text>
                  <Text style={styles.bubbleMeta}>
                    {timeLabel(item.createdAt)}
                    {mine ? (item.pending ? ' · sending' : item.failed ? ' · failed' : ' · sent') : ''}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={onDraftChange}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Pressable
          style={[styles.sendButton, draft.trim().length === 0 && styles.sendDisabled]}
          onPress={send}
          disabled={draft.trim().length === 0}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  statusBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  statusText: { color: colors.textMuted, fontSize: 12 },
  listContent: { padding: spacing.md, gap: 2 },
  dayLabel: {
    alignSelf: 'center',
    color: colors.textMuted,
    fontSize: 11,
    marginVertical: spacing.sm,
  },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: { backgroundColor: colors.bubbleOut, borderTopRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bubbleIn, borderTopLeftRadius: 4 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  bubbleMeta: { color: 'rgba(233,237,239,0.6)', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendDisabled: { opacity: 0.4 },
  sendButtonText: { color: '#04150F', fontWeight: '700' },
});
