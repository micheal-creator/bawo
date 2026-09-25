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
import { api, ApiError, mediaUri } from '../lib/api';
import { pickAndUpload } from '../lib/media';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';

export default function StatusComposeScreen() {
  const router = useRouter();
  const { token } = useSession();
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await api.status.create(token, { text: text.trim(), mediaUrl });
      router.back();
    } catch (publishError) {
      setError(
        publishError instanceof ApiError && publishError.code === 'empty_status'
          ? 'Add some text or a photo first.'
          : 'Could not publish your status.',
      );
    } finally {
      setBusy(false);
    }
  };

  const preview = mediaUri(mediaUrl);
  const canPublish = (text.trim().length > 0 || mediaUrl !== null) && !busy && !uploading;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>New status</Text>
        <Text style={styles.sub}>
          Visible for 24 hours to your contacts and the people you chat with.
        </Text>

        <TextInput
          style={[styles.input, styles.multiline]}
          value={text}
          onChangeText={setText}
          placeholder="Type your status"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={700}
        />

        {preview ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: preview }} style={styles.preview} />
            <Pressable style={styles.removeImage} onPress={() => setMediaUrl(null)}>
              <Text style={styles.removeImageText}>Remove photo</Text>
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
          {busy ? <ActivityIndicator color="#04150F" /> : <Text style={styles.primaryButtonText}>Publish</Text>}
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
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  previewWrap: { gap: spacing.sm },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  removeImage: { alignItems: 'center', paddingVertical: spacing.sm },
  removeImageText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
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
