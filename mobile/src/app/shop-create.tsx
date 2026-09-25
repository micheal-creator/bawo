import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, mediaUri } from '../lib/api';
import { pickAndUpload } from '../lib/media';
import { detectCountryWithoutPermission } from '../lib/location';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';

const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'];

export default function ShopCreateScreen() {
  const router = useRouter();
  const { token } = useSession();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(() => (detectCountryWithoutPermission().country.code === 'GH' ? 'NGN' : 'NGN'));
  const [location, setLocation] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = (() => {
    const value = Number.parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * 100);
  })();

  const attach = async () => {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const url = await pickAndUpload(token);
      if (url) setMediaUrl(url);
    } catch {
      setError('Could not upload that image.');
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const { listing } = await api.shop.create(token, {
        title: title.trim(),
        description: description.trim(),
        priceCents,
        currency,
        location: location.trim() || null,
        mediaUrl,
      });
      router.replace(`/shop/${listing.id}`);
    } catch {
      setError('Could not publish that listing.');
    } finally {
      setBusy(false);
    }
  };

  const preview = mediaUri(mediaUrl);
  const canPublish = title.trim().length >= 3 && !busy && !uploading;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Sell something</Text>
        <Text style={styles.sub}>Buyers message you in a normal chat. No payment happens in the app.</Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Item title"
          placeholderTextColor={colors.textMuted}
          maxLength={120}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the item"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={600}
        />

        <View style={styles.priceRow}>
          <TextInput
            style={[styles.input, styles.priceInput]}
            value={price}
            onChangeText={setPrice}
            placeholder="Price"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <View style={styles.currencyRow}>
            {CURRENCIES.map((code) => (
              <Pressable
                key={code}
                style={[styles.currency, currency === code && styles.currencyActive]}
                onPress={() => setCurrency(code)}
              >
                <Text style={[styles.currencyText, currency === code && styles.currencyTextActive]}>
                  {code}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Location (optional)"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
        />

        {preview ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: preview }} style={styles.preview} />
            <Pressable style={styles.remove} onPress={() => setMediaUrl(null)}>
              <Text style={styles.removeText}>Remove photo</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={() => void attach()} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Add a photo</Text>
            )}
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryButton, !canPublish && styles.buttonDisabled]}
          disabled={!canPublish}
          onPress={() => void publish()}
        >
          {busy ? <ActivityIndicator color="#04150F" /> : <Text style={styles.primaryButtonText}>Publish listing</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
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
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  priceRow: { gap: spacing.sm },
  priceInput: {},
  currencyRow: { flexDirection: 'row', gap: spacing.sm },
  currency: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  currencyActive: { backgroundColor: colors.primary },
  currencyText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  currencyTextActive: { color: '#04150F' },
  previewWrap: { gap: spacing.sm },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  remove: { alignItems: 'center', paddingVertical: spacing.sm },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#04150F', fontSize: 16, fontWeight: '700' },
});
