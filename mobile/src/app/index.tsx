import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { detectCountry, detectCountryWithoutPermission, type DetectionSource } from '../lib/location';
import { COUNTRIES, digitsOnly, formatWithDial, toE164, type Country } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';

type Step = 'phone' | 'code';

const SOURCE_LABEL: Record<DetectionSource, string> = {
  gps: 'detected from your location',
  timezone: 'detected from your timezone',
  locale: 'detected from your language',
  default: 'pick your country',
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_phone':
        return 'That number does not look right. Check the digits and country.';
      case 'invalid_code':
        return 'Wrong or expired code. Try again.';
      default:
        return `Request failed (${error.code}).`;
    }
  }
  return 'Could not reach the bawo server. Is it running?';
}

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [country, setCountry] = useState<Country>(() => detectCountryWithoutPermission().country);
  const [source, setSource] = useState<DetectionSource>(() => detectCountryWithoutPermission().source);
  const [national, setNational] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void detectCountry(true)
      .then((detected) => {
        if (cancelled) return;
        setCountry(detected.country);
        setSource(detected.source);
      })
      .finally(() => {
        if (!cancelled) setLocating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const e164 = toE164(country, national);
  const canRequest = e164 !== null && !busy;
  const canVerify = code.length >= 4 && !busy;

  const requestOtp = useCallback(async () => {
    if (!e164) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.requestOtp(national, country.code);
      setDevCode(result.devCode ?? null);
      setCode(result.devCode ?? '');
      setStep('code');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [e164, national, country.code]);

  const verify = useCallback(async () => {
    if (!e164) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.verifyOtp(national, code, displayName.trim() || undefined, country.code);
      await signIn({ token: result.token, user: result.user });
      router.replace('/chats');
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setBusy(false);
    }
  }, [e164, national, code, displayName, country.code, signIn, router]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.logo}>bawo</Text>
          <Text style={styles.tagline}>
            {step === 'phone'
              ? 'Enter your phone number. We detect your country, so you can type it the way you normally do.'
              : `We sent a code to ${e164 ? formatWithDial(e164, digitsOnly(national)) : digitsOnly(national)}`}
          </Text>
        </View>

        {step === 'phone' ? (
          <View style={styles.form}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Phone number</Text>
              {locating ? (
                <Text style={styles.detectHint}>locating…</Text>
              ) : (
                <Text style={styles.detectHint}>{SOURCE_LABEL[source]}</Text>
              )}
            </View>

            <View style={styles.phoneRow}>
              <Pressable style={styles.countryButton} onPress={() => setPickerOpen(true)}>
                <Text style={styles.countryText}>
                  {country.flag} {country.dial}
                </Text>
              </Pressable>
              <TextInput
                style={styles.input}
                value={national}
                onChangeText={(value) => setNational(digitsOnly(value))}
                placeholder={country.code === 'NG' ? '09016625779' : 'Phone number'}
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                inputMode="tel"
                maxLength={16}
                autoComplete="tel"
              />
            </View>

            <Text style={styles.helper}>
              {country.code === 'NG'
                ? 'Type it like 09016625779 — we add +234 for you. You will keep seeing it as you typed it.'
                : 'Leading zeros and spaces are fine. We store the full international form.'}
            </Text>

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
              onPress={() => void requestOtp()}
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
              onChangeText={(value) => setCode(digitsOnly(value))}
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
              onPress={() => void verify()}
              disabled={!canVerify}
            >
              {busy ? (
                <ActivityIndicator color="#04150F" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify and continue</Text>
              )}
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
                    setSource('default');
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.countryRowText}>
                    {entry.flag} {entry.name}
                  </Text>
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
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  hero: { gap: spacing.sm },
  logo: { color: colors.primary, fontSize: 44, fontWeight: '700', letterSpacing: 1 },
  tagline: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  form: { gap: spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.textMuted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
  detectHint: { color: colors.primary, fontSize: 11 },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  countryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  countryText: { color: colors.text, fontSize: 16 },
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
  codeInput: { letterSpacing: 6, textAlign: 'center', fontSize: 22 },
  hint: { color: colors.primary, fontSize: 13 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: '#04150F', fontSize: 16, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', paddingVertical: spacing.md },
  secondaryButtonText: { color: colors.textMuted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
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
  countryRowText: { color: colors.text, fontSize: 16 },
  countryRowDial: { color: colors.textMuted, fontSize: 15 },
});
