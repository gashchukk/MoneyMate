import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Linking, Modal, TextInput,
  KeyboardAvoidingView, Platform, AppState, AppStateStatus,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t, Currency, Language } from '@/components/AppContext';
import { BRAND } from '@/constants/brand';

export default function SettingsScreen() {
  const { currency, setCurrency, language, setLanguage } = useAppSettings();
  const [monoLoading, setMonoLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [waitingForMono, setWaitingForMono] = useState(false);
  // Ref so AppState callback always sees the latest value without re-registering
  const waitingForMonoRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);

  // ── Auto-sync when returning from Monobank app ────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      const comingToForeground =
        appStateRef.current.match(/inactive|background/) && next === 'active';
      if (comingToForeground && waitingForMonoRef.current) {
        waitingForMonoRef.current = false;
        setWaitingForMono(false);
        const requestId = await SecureStore.getItemAsync('mono_request_id');
        if (requestId) {
          setSyncLoading(true);
          try {
            await apiFetch(`/mono/sync-accounts?request_id=${requestId}`, { method: 'POST' });
            await apiFetch(`/mono/sync-transactions?request_id=${requestId}`, { method: 'POST' });
            Alert.alert('✅ Linked & Synced', 'Monobank accounts and transactions imported successfully.');
          } catch (e: any) {
            Alert.alert('Sync failed', e.message);
          } finally {
            setSyncLoading(false);
          }
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // ── Monobank: request access ──────────────────────────────────────────────
  const handleMonoLink = async () => {
    setMonoLoading(true);
    try {
      const data = await apiFetch('/mono/auth/request', { method: 'POST' });
      const url = data.acceptUrl ?? data.url;
      if (url) {
        if (data.tokenRequestId) {
          await SecureStore.setItemAsync('mono_request_id', data.tokenRequestId);
        }
        // Mark that we're waiting — AppState listener will auto-sync on return
        waitingForMonoRef.current = true;
        setWaitingForMono(true);
        await Linking.openURL(url);
      } else {
        Alert.alert('Monobank', 'Request sent. Check the Monobank app to approve.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setMonoLoading(false);
    }
  };

  // ── Monobank: manual sync (already linked) ────────────────────────────────
  const handleMonoSync = async () => {
    const requestId = await SecureStore.getItemAsync('mono_request_id');
    if (!requestId) {
      Alert.alert('Not linked', 'Please link your Monobank account first.');
      return;
    }
    setSyncLoading(true);
    try {
      await apiFetch(`/mono/sync-accounts?request_id=${requestId}`, { method: 'POST' });
      await apiFetch(`/mono/sync-transactions?request_id=${requestId}`, { method: 'POST' });
      Alert.alert('✅ Synced', 'Accounts and transactions updated.');
    } catch (e: any) {
      Alert.alert('Sync failed', e.message);
    } finally {
      setSyncLoading(false);
    }
  };

  // ── Change password ───────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert('Missing fields', 'Please fill in all fields.'); return;
    }
    if (newPw.length < 8) {
      Alert.alert('Weak password', 'New password must be at least 8 characters.'); return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Mismatch', 'New passwords do not match.'); return;
    }
    setChangePwLoading(true);
    try {
      await apiFetch('/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      Alert.alert('Done', 'Password updated successfully.');
      setShowChangePw(false);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setChangePwLoading(false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert(t('logout', language), 'Are you sure?', [
      { text: t('cancel', language), style: 'cancel' },
      {
        text: t('logout', language), style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
          await SecureStore.deleteItemAsync('mono_request_id');
          router.replace('/auth');
        },
      },
    ]);
  };

  return (
    <>
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settings', language)}</Text>
      </View>

      {/* ── System Currency ── */}
      <Text style={styles.sectionTitle}>{t('system_currency', language)}</Text>
      <View style={styles.card}>
        {(['UAH', 'USD', 'EUR'] as Currency[]).map((c, i, arr) => (
          <TouchableOpacity
            key={c}
            style={[styles.optionRow, i < arr.length - 1 && styles.optionBorder]}
            onPress={() => setCurrency(c)}
          >
            <Text style={styles.optionLabel}>
              {c === 'UAH' ? '🇺🇦' : c === 'USD' ? '🇺🇸' : '🇪🇺'} {c}
            </Text>
            <View style={[styles.radio, currency === c && styles.radioActive]}>
              {currency === c && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Language ── */}
      <Text style={styles.sectionTitle}>{t('language', language)}</Text>
      <View style={styles.card}>
        {([['en', '🇬🇧', 'english'], ['uk', '🇺🇦', 'ukrainian']] as [Language, string, string][]).map(([code, flag, key], i, arr) => (
          <TouchableOpacity
            key={code}
            style={[styles.optionRow, i < arr.length - 1 && styles.optionBorder]}
            onPress={() => setLanguage(code)}
          >
            <Text style={styles.optionLabel}>{flag} {t(key, language)}</Text>
            <View style={[styles.radio, language === code && styles.radioActive]}>
              {language === code && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Account ── */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.actionRow} onPress={() => setShowChangePw(true)}>
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>🔑</Text>
            <Text style={styles.actionLabel}>Change Password</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Monobank ── */}
      <Text style={styles.sectionTitle}>{t('monobank', language)}</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.actionRow, styles.optionBorder]}
          onPress={handleMonoLink}
          disabled={monoLoading || waitingForMono}
        >
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>🟡</Text>
            <View>
              <Text style={styles.actionLabel}>{t('link_monobank', language)}</Text>
              {waitingForMono && (
                <Text style={styles.actionHint}>Waiting for approval — return here when done</Text>
              )}
            </View>
          </View>
          {monoLoading || waitingForMono
            ? <ActivityIndicator color={BRAND} />
            : <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={handleMonoSync}
          disabled={syncLoading || waitingForMono}
        >
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>🔄</Text>
            <Text style={styles.actionLabel}>{t('sync_mono', language)}</Text>
          </View>
          {syncLoading ? <ActivityIndicator color={BRAND} /> : <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Logout ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('logout', language)}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>MoneyMate v1.0</Text>
    </ScrollView>

    {/* ── Change Password Modal ── */}
    <Modal visible={showChangePw} animationType="slide" transparent onRequestClose={() => setShowChangePw(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Change Password</Text>

          <Text style={styles.modalLabel}>Current Password</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter current password"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={currentPw}
            onChangeText={setCurrentPw}
          />

          <Text style={styles.modalLabel}>New Password</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Min. 8 characters"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={newPw}
            onChangeText={setNewPw}
          />

          <Text style={styles.modalLabel}>Confirm New Password</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Repeat new password"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={confirmPw}
            onChangeText={setConfirmPw}
          />

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowChangePw(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, changePwLoading && { opacity: 0.65 }]} onPress={handleChangePassword} disabled={changePwLoading}>
              {changePwLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingBottom: 60 },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginHorizontal: 20, marginTop: 24, marginBottom: 8,
  },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16,
    borderWidth: 1, borderColor: '#f0f0f0',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },

  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16,
  },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  optionLabel: { fontSize: 16, color: '#1a1a1a', fontWeight: '500' },

  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#ddd',
    justifyContent: 'center', alignItems: 'center',
  },
  radioActive: { borderColor: BRAND },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },

  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIcon: { fontSize: 22 },
  actionLabel: { fontSize: 16, color: '#1a1a1a', fontWeight: '500' },
  actionHint: { fontSize: 11, color: '#aaa', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc', fontWeight: '300' },

  logoutBtn: {
    marginHorizontal: 16, marginTop: 32,
    backgroundColor: '#fff5f5', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ffcccc',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#c0392b' },

  version: {
    textAlign: 'center', fontSize: 12, color: '#ccc', marginTop: 24,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 24 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7 },
  modalInput: { backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1a1a1a', borderWidth: 1.5, borderColor: '#eee', marginBottom: 18 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#888' },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: BRAND },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
