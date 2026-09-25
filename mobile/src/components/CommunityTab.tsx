import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../lib/api';
import { initials, relativeLabel } from '../lib/format';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';
import type { Community } from '../lib/types';

export function CommunityTab() {
  const router = useRouter();
  const { token } = useSession();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { communities: list } = await api.communities.list(token, mineOnly);
      setCommunities(list);
      setError(null);
    } catch {
      setError('Could not load communities.');
    } finally {
      setLoading(false);
    }
  }, [token, mineOnly]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const create = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const { community } = await api.communities.create(token, name.trim(), description.trim());
      setCreateOpen(false);
      setName('');
      setDescription('');
      await load();
      router.push(`/community/${community.id}`);
    } catch (createError) {
      setError(
        createError instanceof ApiError && createError.code === 'name_taken'
          ? 'That community name is already taken.'
          : 'Could not create the community.',
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleJoin = async (community: Community) => {
    if (!token) return;
    if (community.joined) await api.communities.leave(token, community.id);
    else await api.communities.join(token, community.id);
    await load();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable
          style={[styles.filter, !mineOnly && styles.filterActive]}
          onPress={() => setMineOnly(false)}
        >
          <Text style={[styles.filterText, !mineOnly && styles.filterTextActive]}>Discover</Text>
        </Pressable>
        <Pressable
          style={[styles.filter, mineOnly && styles.filterActive]}
          onPress={() => setMineOnly(true)}
        >
          <Text style={[styles.filterText, mineOnly && styles.filterTextActive]}>My communities</Text>
        </Pressable>
        <Pressable style={styles.newButton} onPress={() => setCreateOpen(true)}>
          <Text style={styles.newButtonText}>New</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={communities.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>
                {mineOnly ? 'You have not joined any communities' : 'No communities yet'}
              </Text>
              <Text style={styles.emptyText}>Create one and invite people to post in it.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/community/${item.id}`)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {item.memberCount} member(s) · {item.postCount} post(s)
                  {item.role === 'admin' ? ' · you are admin' : item.joined ? ' · joined' : ''}
                </Text>
                {item.description.length > 0 ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={[styles.joinButton, item.joined && styles.joinButtonActive]}
                onPress={() => void toggleJoin(item)}
              >
                <Text style={[styles.joinText, item.joined && styles.joinTextActive]}>
                  {item.joined ? 'Leave' : 'Join'}
                </Text>
              </Pressable>
            </Pressable>
          )}
          ListFooterComponent={
            error ? <Text style={styles.error}>{error}</Text> : null
          }
        />
      )}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>New community</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Community name"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="What is it about?"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={300}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.primaryButton, (busy || name.trim().length < 3) && styles.buttonDisabled]}
              disabled={busy || name.trim().length < 3}
              onPress={() => void create()}
            >
              {busy ? (
                <ActivityIndicator color="#04150F" />
              ) : (
                <Text style={styles.primaryButtonText}>Create</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function CommunityPostRow({ post }: { post: { authorName: string; body: string; createdAt: string; isAnnouncement: boolean } }) {
  return (
    <View style={styles.postRow}>
      <Text style={styles.postAuthor}>
        {post.authorName} · {relativeLabel(post.createdAt)}
        {post.isAnnouncement ? ' · announcement' : ''}
      </Text>
      <Text style={styles.postBody}>{post.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, alignItems: 'center' },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
  },
  filterActive: { backgroundColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 13 },
  filterTextActive: { color: '#04150F', fontWeight: '700' },
  newButton: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  newButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  listContent: { paddingBottom: spacing.xl },
  emptyContainer: { flexGrow: 1 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 },
  description: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  joinButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  joinButtonActive: { backgroundColor: colors.surfaceAlt },
  joinText: { color: '#04150F', fontSize: 12, fontWeight: '700' },
  joinTextActive: { color: colors.textMuted },
  postRow: { gap: 4, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  postAuthor: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  postBody: { color: colors.text, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 13, padding: spacing.lg },
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#04150F', fontSize: 16, fontWeight: '700' },
});
