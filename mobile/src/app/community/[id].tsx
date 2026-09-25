import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { relativeLabel } from '../../lib/format';
import { useSession } from '../../lib/session';
import { colors, spacing } from '../../lib/theme';
import type { Community, CommunityPost } from '../../lib/types';

export default function CommunityScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const communityId = typeof params.id === 'string' ? params.id : '';
  const { token } = useSession();

  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !communityId) return;
    try {
      const [{ community: detail }, postsResult] = await Promise.all([
        api.communities.get(token, communityId),
        api.communities.posts(token, communityId).catch(() => ({ posts: [] as CommunityPost[] })),
      ]);
      setCommunity(detail);
      setPosts(postsResult.posts);
      setError(null);
    } catch {
      setError('Could not load this community.');
    } finally {
      setLoading(false);
    }
  }, [token, communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMembership = async () => {
    if (!token || !community) return;
    if (community.joined) await api.communities.leave(token, community.id);
    else await api.communities.join(token, community.id);
    await load();
  };

  const submit = async () => {
    if (!token || !community || draft.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.communities.post(token, community.id, draft.trim(), null, announce);
      setDraft('');
      setAnnounce(false);
      await load();
    } catch (postError) {
      setError(
        postError instanceof ApiError && postError.code === 'not_admin'
          ? 'Only admins can post announcements.'
          : postError instanceof ApiError && postError.code === 'not_a_member'
            ? 'Join the community before posting.'
            : 'Could not post that.',
      );
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

  if (!community) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Community not found</Text>
      </View>
    );
  }

  const isAdmin = community.role === 'admin';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{community.name}</Text>
        <Text style={styles.meta}>
          {community.memberCount} member(s) · {community.postCount} post(s)
          {isAdmin ? ' · you are admin' : ''}
        </Text>
        {community.description.length > 0 ? (
          <Text style={styles.description}>{community.description}</Text>
        ) : null}
        <Pressable
          style={[styles.membership, community.joined && styles.membershipActive]}
          onPress={() => void toggleMembership()}
        >
          <Text style={[styles.membershipText, community.joined && styles.membershipTextActive]}>
            {community.joined ? 'Leave community' : 'Join community'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={posts.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyText}>
              {community.joined ? 'Be the first to post.' : 'Join to see and write posts.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.post, item.isAnnouncement && styles.postAnnouncement]}>
            <Text style={styles.postAuthor}>
              {item.authorName} · {relativeLabel(item.createdAt)}
              {item.isAnnouncement ? ' · 📣 announcement' : ''}
            </Text>
            <Text style={styles.postBody}>{item.body}</Text>
          </View>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {community.joined ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a post"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          {isAdmin ? (
            <Pressable style={styles.announceToggle} onPress={() => setAnnounce((value) => !value)}>
              <View style={[styles.checkbox, announce && styles.checkboxOn]}>
                {announce ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.announceLabel}>Announcement</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.sendButton, (busy || draft.trim().length === 0) && styles.buttonDisabled]}
            disabled={busy || draft.trim().length === 0}
            onPress={() => void submit()}
          >
            <Text style={styles.sendText}>{busy ? '…' : 'Post'}</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyContainer: { flexGrow: 1 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  header: { padding: spacing.lg, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  description: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  membership: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  membershipActive: { backgroundColor: colors.surfaceAlt },
  membershipText: { color: '#04150F', fontSize: 12, fontWeight: '700' },
  membershipTextActive: { color: colors.textMuted },
  listContent: { paddingBottom: spacing.lg },
  post: { padding: spacing.lg, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  postAnnouncement: { backgroundColor: colors.primaryDark },
  postAuthor: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  postBody: { color: colors.text, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.lg },
  composer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
    maxHeight: 110,
  },
  announceToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#04150F', fontSize: 13, fontWeight: '700' },
  announceLabel: { color: colors.textMuted, fontSize: 13 },
  sendButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing.md, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  sendText: { color: '#04150F', fontSize: 15, fontWeight: '700' },
});
