import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../lib/api';
import { detectCountryWithoutPermission } from '../lib/location';
import { digitsOnly } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';

export default function GroupCreateScreen() {
  const router = useRouter();
  const { token } = useSession();
  const [title, setTitle] = useState('');
  const [numbers, setNumbers] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = detectCountryWithoutPermission().country;

  const create = async () => {
    if (!token) return;
    const entered = numbers
      .split(/[\s,;]+/)
      .map((value) => digitsOnly(value))
      .filter((value) => value.length >= 6);
    if (title.trim().length === 0 || entered.length === 0) {
      setError('Add a group name and at least one number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const members: string[] = [];
      for (const entry of entered) {
        const { contact } = await api.addContact(token, entry, undefined, country.code);
        members.push(contact.id);
      }
      const { conversationId } = await api.createGroup(token, title.trim(), members);
      router.replace(`/chat/${conversationId}`);
    } catch {
      setError('Could not create that group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.heading}>New group</Text>
        <Text style={styles.sub}>
          Numbers use {country.dial} by default. Type them the way you normally dial.
        </Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          maxLength={60}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={numbers}
          onChangeText={setNumbers}
          placeholder="09016625779, 08021234567"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={() => void create()}
        >
          {busy ? <ActivityIndicator color="#04150F" /> : <Text style={styles.primaryButtonText}>Create group</Text>}
        </Pressable>
      </View>
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
