import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChatList } from '../components/ChatList';
import { CommunityTab } from '../components/CommunityTab';
import { ShopTab } from '../components/ShopTab';
import { StatusTab } from '../components/StatusTab';
import { api, ApiError } from '../lib/api';
import { detectCountryWithoutPermission } from '../lib/location';
import { COUNTRIES, digitsOnly, toE164, type Country } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, spacing } from '../lib/theme';

type Tab = 'chats' | 'status' | 'community' | 'shop';

const TABS: { key: Tab; label: string }[] = [
  { key: 'chats', label: 'Chats' },
  { key: 'status', label: 'Status' },
  { key: 'community', label: 'Community' },
  { key: 'shop', label: 'Shop' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { token, user, socket, signOut } = useSession();
  const [tab, setTab] = useState<Tab>('chats');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [country, setCountry] = useState<Country>(() => detectCountryWithoutPermission().country);
  const [national, setNational] = useState('');
  const [saveToContacts, setSaveToContacts] = useState(true);
  const [contactName, setContactName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e164 = useMemo(() => toE164(country, national), [country, national]);
  const connected = socket?.connected === true;

  const startChat = async () => {
    if (!token || !e164) return;
    setBusy(true);
    setError(null);
    try {
      if (saveToContacts) {
        await api.addContact(token, national, contactName.trim() || undefined, country.code);
      }
      const { conversationId } = await api.startDirect(token, { phone: national, userId: undefined });
      setNewChatOpen(false);
      setNational('');
      setContactName('');
      router.push(`/chat/${conversationId}`);
    } catch (startError) {
      setError(
        startError instanceof ApiError && startError.code === 'invalid_peer'
          ? 'That number belongs to you.'
          : 'Could not start that chat.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {TABS.map((entry) => (
          <Pressable
            key={entry.key}
            style={[styles.tab, tab === entry.key && styles.tabActive]}
            onPress={() => setTab(entry.key)}
          >
            <Text style={[styles.tabText, tab === entry.key && styles.tabTextActive]}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {tab === 'chats' ? <ChatList /> : null}
        {tab === 'status' ? <StatusTab /> : null}
        {tab === 'community' ? <CommunityTab /> : null}
        {tab === 'shop' ? <ShopTab /> : null}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.actionButton} onPress={() => setNewChatOpen(true)}>
          <Text style={styles.actionButtonText}>New chat</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => router.push('/group-create')}>
          <Text style={styles.actionButtonText}>New group</Text>
        </Pressable>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>
            {connected ? 'connected' : 'offline'} · {user?.displayName ?? ''}
          </Text>
        </View>
        <Pressable onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <Modal visible={newChatOpen} animationType="slide" transparent onRequestClose={() => setNewChatOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNewChatOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>New chat</Text>

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
              />
            </View>
            <Text style={styles.helper}>
              Type the number the way you normally dial it. We add {country.dial} in the background and keep
              showing it as you entered it.
            </Text>

            <Pressable style={styles.checkboxRow} onPress={() => setSaveToContacts((value) => !value)}>
              <View style={[styles.checkbox, saveToContacts && styles.checkboxOn]}>
                {saveToContacts ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>Save to my contacts</Text>
            </Pressable>

            {saveToContacts ? (
              <TextInput
                style={styles.input}
                value={contactName}
                onChangeText={setContactName}
                placeholder="Contact name (optional)"
                placeholderTextColor={colors.textMuted}
                maxLength={60}
              />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryButton, (!e164 || busy) && styles.buttonDisabled]}
              disabled={!e164 || busy}
              onPress={() => void startChat()}
            >
              {busy ? (
                <ActivityIndicator color="#04150F" />
              ) : (
                <Text style={styles.primaryButtonText}>Start chat</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={[styles.modalSheet, styles.pickerSheet]}>
            {COUNTRIES.map((entry) => (
              <Pressable
                key={entry.code}
                style={styles.countryRow}
                onPress={() => {
                  setCountry(entry);
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.countryRowText}>
                  {entry.flag} {entry.name}
                </Text>
                <Text style={styles.countryRowDial}>{entry.dial}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#04150F' },
  body: { flex: 1, marginTop: spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionButtonText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  statusPill: { marginLeft: 'auto' },
  statusText: { color: colors.textMuted, fontSize: 11 },
  signOut: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pickerSheet: { maxHeight: '60%' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
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
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#04150F', fontSize: 14, fontWeight: '700' },
  checkboxLabel: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#04150F', fontSize: 16, fontWeight: '700' },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  countryRowText: { color: colors.text, fontSize: 16 },
  countryRowDial: { color: colors.textMuted, fontSize: 15 },
});
