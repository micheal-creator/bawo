import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, mediaUri } from '../lib/api';
import { formatPrice, initials, relativeLabel } from '../lib/format';
import { formatDisplay } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';
import type { Listing } from '../lib/types';

export function ShopTab() {
  const router = useRouter();
  const { token } = useSession();
  const [listings, setListings] = useState<Listing[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { listings: list } = await api.shop.list(token, mineOnly);
      setListings(list);
      setError(null);
    } catch {
      setError('Could not load the shop.');
    } finally {
      setLoading(false);
    }
  }, [token, mineOnly]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable style={[styles.filter, !mineOnly && styles.filterActive]} onPress={() => setMineOnly(false)}>
          <Text style={[styles.filterText, !mineOnly && styles.filterTextActive]}>Browse</Text>
        </Pressable>
        <Pressable style={[styles.filter, mineOnly && styles.filterActive]} onPress={() => setMineOnly(true)}>
          <Text style={[styles.filterText, mineOnly && styles.filterTextActive]}>My listings</Text>
        </Pressable>
        <Pressable style={styles.newButton} onPress={() => router.push('/shop-create')}>
          <Text style={styles.newButtonText}>Sell</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={listings.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>{mineOnly ? 'You have no listings' : 'Nothing for sale yet'}</Text>
              <Text style={styles.emptyText}>Tap Sell to post the first item.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const image = mediaUri(item.mediaUrl);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/shop/${item.id}`)}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.cardImage} />
                ) : (
                  <View style={[styles.cardImage, styles.cardImageEmpty]}>
                    <Text style={styles.cardImageText}>{initials(item.title)}</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardPrice}>{formatPrice(item.priceCents, item.currency)}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.sellerName} · {formatDisplay(item.sellerPhone, item.sellerNationalPhone)}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.location ? `${item.location} · ` : ''}
                    {relativeLabel(item.createdAt)}
                    {item.status !== 'active' ? ` · ${item.status}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={error ? <Text style={styles.error}>{error}</Text> : null}
        />
      )}
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
  listContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  emptyContainer: { flexGrow: 1 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardImage: { width: 96, height: 96, backgroundColor: colors.surfaceAlt },
  cardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardImageText: { color: colors.textMuted, fontSize: 20, fontWeight: '700' },
  cardBody: { flex: 1, paddingVertical: spacing.sm, paddingRight: spacing.md, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  cardPrice: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 11 },
  error: { color: colors.danger, fontSize: 13, padding: spacing.lg },
});
