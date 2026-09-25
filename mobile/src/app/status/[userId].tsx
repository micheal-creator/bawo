import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, mediaUri } from '../../lib/api';
import { dayLabel, expiryLabel, timeLabel } from '../../lib/format';
import { formatWithDial } from '../../lib/phone';
import { useSession } from '../../lib/session';
import { colors, spacing } from '../../lib/theme';
import type { StatusGroup, StatusViewer } from '../../lib/types';

export default function StatusViewerScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const targetUserId = typeof params.userId === 'string' ? params.userId : '';
  const router = useRouter();
  const { token, user } = useSession();

  const [group, setGroup] = useState<StatusGroup | null>(null);
  const [viewers, setViewers] = useState<StatusViewer[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !targetUserId) return;
    try {
      const { groups } = await api.status.feed(token);
      const found = groups.find((entry) => entry.user.id === targetUserId) ?? null;
      setGroup(found);
      if (found) {
        for (const item of found.items) {
          if (!item.viewed) await api.status.view(token, item.id);
        }
        if (found.user.id === user?.id && found.items[0]) {
          const result = await api.status.viewers(token, found.items[0].id);
          setViewers(result.viewers);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [token, targetUserId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeItem = async (statusId: string) => {
    if (!token) return;
    await api.status.remove(token, statusId);
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!group || group.items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>This status has expired</Text>
        <Text style={styles.emptyText}>Status updates disappear after 24 hours.</Text>
      </View>
    );
  }

  const safeIndex = Math.min(index, group.items.length - 1);
  const item = group.items[safeIndex];
  const image = mediaUri(item?.mediaUrl);
  const isMine = group.user.id === user?.id;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.author}>{group.user.displayName}</Text>
          <Text style={styles.meta}>
            {item ? `${dayLabel(item.createdAt)} ${timeLabel(item.createdAt)}` : ''} ·{' '}
            {item ? expiryLabel(item.expiresAt) : ''}
          </Text>
          <Text style={styles.number}>
            {formatWithDial(group.user.phone, group.user.nationalPhone)}
          </Text>
        </View>
        {isMine ? (
          <Pressable style={styles.deleteButton} onPress={() => item && void removeItem(item.id)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        ) : null}
      </View>

      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.textCard}>
          <Text style={styles.textBody}>{item?.text}</Text>
        </View>
      )}

      {image && item?.text ? (
        <View style={styles.captionWrap}>
          <Text style={styles.caption}>{item.text}</Text>
        </View>
      ) : null}

      <View style={styles.progress}>
        {group.items.map((entry, entryIndex) => (
          <Pressable
            key={entry.id}
            style={[styles.progressBar, entryIndex <= safeIndex && styles.progressBarOn]}
            onPress={() => setIndex(entryIndex)}
          >
            <Text style={styles.progressLabel}>{entryIndex + 1}</Text>
          </Pressable>
        ))}
      </View>

      {isMine && viewers.length > 0 ? (
        <ScrollView style={styles.viewers} contentContainerStyle={styles.viewersContent}>
          <Text style={styles.viewersTitle}>Seen by {viewers.length}</Text>
          {viewers.map((viewer) => (
            <Text key={viewer.id} style={styles.viewerRow}>
              {viewer.displayName} · {timeLabel(viewer.viewedAt)}
            </Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.background },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerLeft: { flex: 1, gap: 2 },
  author: { color: colors.text, fontSize: 17, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  number: { color: colors.primary, fontSize: 12 },
  deleteButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  image: { flex: 1, width: '100%' },
  textCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  textBody: { color: colors.text, fontSize: 24, lineHeight: 32, textAlign: 'center' },
  captionWrap: { padding: spacing.lg },
  caption: { color: colors.text, fontSize: 16, lineHeight: 22 },
  progress: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  progressBar: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  progressBarOn: { backgroundColor: colors.primary },
  progressLabel: { color: '#04150F', fontSize: 12, fontWeight: '700' },
  viewers: { maxHeight: 140, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  viewersContent: { padding: spacing.lg, gap: 4 },
  viewersTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: spacing.xs },
  viewerRow: { color: colors.textMuted, fontSize: 12 },
});
