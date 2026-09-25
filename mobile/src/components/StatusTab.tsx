import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, mediaUri } from '../lib/api';
import { expiryLabel, initials, relativeLabel } from '../lib/format';
import { formatDisplay } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';
import type { StatusGroup } from '../lib/types';

export function StatusTab() {
  const router = useRouter();
  const { token, user } = useSession();
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { groups: feed } = await api.status.feed(token);
      setGroups(feed);
      setError(null);
    } catch {
      setError('Could not load status updates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mine = groups.filter((group) => group.user.id === user?.id);
  const others = groups.filter((group) => group.user.id !== user?.id);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const header = (
    <View>
      <Pressable style={styles.myStatus} onPress={() => router.push('/status-compose')}>
        <View style={[styles.avatar, mine.length > 0 && styles.avatarActive]}>
          <Text style={styles.avatarText}>{initials(user?.displayName ?? 'Me')}</Text>
        </View>
        <View style={styles.myBody}>
          <Text style={styles.myTitle}>My status</Text>
          <Text style={styles.myHint}>
            {mine.length === 0
              ? 'Tap to add a photo or text update'
              : `${mine[0]?.items.length ?? 0} update(s) · ${expiryLabel(mine[0]?.items[0]?.expiresAt ?? '')}`}
          </Text>
        </View>
        <Text style={styles.addBadge}>+</Text>
      </Pressable>
      {others.length > 0 ? <Text style={styles.sectionLabel}>Recent updates</Text> : null}
    </View>
  );

  return (
    <FlatList
      data={others}
      keyExtractor={(item) => item.user.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.listContent}
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
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No updates from others</Text>
          <Text style={styles.emptyText}>
            Status updates from your contacts and the people you chat with show up here for 24 hours.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const latest = item.items[item.items.length - 1];
        const thumb = mediaUri(latest?.mediaUrl);
        return (
          <Pressable style={styles.row} onPress={() => router.push(`/status/${item.user.id}`)}>
            <View style={[styles.avatar, item.unseenCount > 0 && styles.avatarActive]}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials(item.user.displayName)}</Text>
              )}
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{item.user.displayName}</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {relativeLabel(item.latestAt)} · {item.items.length} update(s) ·{' '}
                {formatDisplay(item.user.phone, item.user.nationalPhone)}
              </Text>
            </View>
            {item.unseenCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unseenCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      }}
      ListFooterComponent={error ? <Text style={styles.error}>{error}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: spacing.sm },
  myStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  myBody: { flex: 1, gap: 2 },
  myTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  myHint: { color: colors.textMuted, fontSize: 12 },
  addBadge: { color: colors.primary, fontSize: 26, fontWeight: '300' },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  avatarActive: { borderColor: colors.primary },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  body: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 },
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
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, padding: spacing.lg },
});
