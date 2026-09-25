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
import { api, ApiError, mediaUri } from '../../lib/api';
import { formatPrice, relativeLabel } from '../../lib/format';
import { formatWithDial } from '../../lib/phone';
import { useSession } from '../../lib/session';
import { colors, spacing } from '../../lib/theme';
import type { Listing } from '../../lib/types';

export default function ListingScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { token, user } = useSession();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !listingId) return;
    try {
      const { listing: detail } = await api.shop.get(token, listingId);
      setListing(detail);
      setError(null);
    } catch {
      setError('Could not load this listing.');
    } finally {
      setLoading(false);
    }
  }, [token, listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const contactSeller = async () => {
    if (!token || !listing) return;
    setBusy(true);
    setError(null);
    try {
      const { conversationId } = await api.shop.contact(token, listing.id);
      router.push(`/chat/${conversationId}`);
    } catch (contactError) {
      setError(
        contactError instanceof ApiError && contactError.code === 'cannot_contact_self'
          ? 'This is your own listing.'
          : 'Could not open a chat with the seller.',
      );
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'active' | 'sold' | 'archived') => {
    if (!token || !listing) return;
    setBusy(true);
    try {
      const { listing: updated } = await api.shop.setStatus(token, listing.id, status);
      setListing(updated);
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

  if (!listing) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Listing not available</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  const image = mediaUri(listing.mediaUrl);
  const isMine = listing.sellerId === user?.id;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imageEmpty]}>
          <Text style={styles.imageEmptyText}>No photo</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.price}>{formatPrice(listing.priceCents, listing.currency)}</Text>
        <Text style={styles.meta}>
          {listing.location ? `${listing.location} · ` : ''}
          listed {relativeLabel(listing.createdAt)}
          {listing.status !== 'active' ? ` · ${listing.status.toUpperCase()}` : ''}
        </Text>

        {listing.description.length > 0 ? <Text style={styles.description}>{listing.description}</Text> : null}

        <View style={styles.sellerCard}>
          <Text style={styles.sellerLabel}>Seller</Text>
          <Text style={styles.sellerName}>{listing.sellerName}</Text>
          <Text style={styles.sellerPhone}>
            {formatWithDial(listing.sellerPhone, listing.sellerNationalPhone)}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isMine ? (
          <View style={styles.ownerActions}>
            <Pressable
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => void setStatus(listing.status === 'sold' ? 'active' : 'sold')}
            >
              <Text style={styles.secondaryButtonText}>
                {listing.status === 'sold' ? 'Mark as available' : 'Mark as sold'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.dangerButton, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => void setStatus('archived')}
            >
              <Text style={styles.dangerButtonText}>Archive</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => void contactSeller()}
          >
            {busy ? (
              <ActivityIndicator color="#04150F" />
            ) : (
              <Text style={styles.primaryButtonText}>Message seller</Text>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.background },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  image: { width: '100%', height: 260, backgroundColor: colors.surfaceAlt },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  imageEmptyText: { color: colors.textMuted, fontSize: 13 },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  price: { color: colors.primary, fontSize: 22, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  description: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: spacing.sm },
  sellerCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sellerLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  sellerName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sellerPhone: { color: colors.primary, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  primaryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#04150F', fontSize: 16, fontWeight: '700' },
  ownerActions: { marginTop: spacing.md, gap: spacing.sm },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerButtonText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
