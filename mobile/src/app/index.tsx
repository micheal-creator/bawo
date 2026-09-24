import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../lib/api';
import { COUNTRIES, detectCountry, isValidE164, normalizeNational, toE164, type Country } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';

type Step = 'phone' | 'code';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_phone':
        return 'That phone number does not look right.';
      case 'invalid_code':
        return 'Wrong or expired code. Try again.';
      case 'not_found':
        return 'Could not reach the bawo server.';
      default:
        return `Request failed (${error.code}).`;
    }
  }
  return 'Could not reach the bawo server. Is it running?';
}

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [country, setCountry] = useState<Country>(() => detectCountry());
  const [national, setNational] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const e164 = useMemo(() => toE164(country, national), [country, national]);
  const canRequest = e164 !== null && !busy;
  const canVerify = code.length >= 4 && !busy;

  const requestOtp = async () => {
    if (!e164) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.requestOtp(e164);
      setDevCode(result.devCode ?? null);
      setCode(result.devCode ?? '');
      setStep('code');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!e164 || !isValidE164(e164)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.verifyOtp(e164, code, displayName.trim() || undefined);
      await signIn({ token: result.token, user: result.user });
      router.replace('/chats');
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.logo}>bawo</Text>
          <Text style={styles.tagline}>
            {step === 'phone'
              ? 'Enter your phone number to keep the conversation going.'
              : `We sent a code to ${e164 ?? ''}`}
          </Text>
        </View>

        {step === 'phone' ? (
          <View style={styles.form}>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneRow}>
              <Pressable style={styles.countryButton} onPress={() => setPickerOpen(true)}>
                <Text style={styles.countryText}>{country.flag} {country.dial}</Text>
              </Pressable>
              <TextInput
                style={styles.input}
                value={national}
                onChangeText={(value) => setNational(normalizeNational(value))}
                placeholder="8012345678"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={14}
                autoComplete="tel"
              />
            </View>

            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
            />

            <Pressable
              style={[styles.primaryButton, !canRequest && styles.buttonDisabled]}
              onPress={requestOtp}
              disabled={!canRequest}
            >
              {busy ? <ActivityIndicator color="#04150F" /> : <Text style={styles.primaryButtonText}>Send code</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />

            {devCode ? <Text style={styles.hint}>Dev mode code: {devCode}</Text> : null}

            <Pressable
              style={[styles.primaryButton, !canVerify && styles.buttonDisabled]}
              onPress={verify}
              disabled={!canVerify}
            >
              {busy ? <ActivityIndicator color="#04150F" /> : <Text style={styles.primaryButtonText}>Verify and continue</Text>}
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              <Text style={styles.secondaryButtonText}>Use a different number</Text>
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <ScrollView>
              {COUNTRIES.map((entry) => (
                <Pressable
                  key={entry.code}
                  style={styles.countryRow}
                  onPress={() => {
                    setCountry(entry);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.countryRowText}>{entry.flag} {entry.name}</Text>
                  <Text style={styles.countryRowDial}>{entry.dial}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  hero: {
    gap: spacing.sm,
  },
  logo: {
    color: colors.primary,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  form: {
    gap: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  countryText: {
    color: colors.text,
    fontSize: 16,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: {
    letterSpacing: 6,
    textAlign: 'center',
    fontSize: 22,
  },
  hint: {
    color: colors.primary,
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: '#04150F',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingVertical: spacing.sm,
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  countryRowText: {
    color: colors.text,
    fontSize: 16,
  },
  countryRowDial: {
    color: colors.textMuted,
    fontSize: 15,
  },
});
