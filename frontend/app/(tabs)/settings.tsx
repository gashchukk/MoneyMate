import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Linking, Modal, TextInput,
  KeyboardAvoidingView, Platform, AppState, AppStateStatus,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/constants/api';
import { useAppSettings, Currency, Language } from '@/components/AppContext';
import { BRAND, currencySymbol } from '@/constants/brand';
import QRCode from 'react-native-qrcode-svg';

const TYPE_ICON: Record<string, string> = {
  black: '🖤', white: '🤍', platinum: '🔘', iron: '⚙️',
  fop: '🏢', yellow: '💛', eAid: '🟢',
  cash: '💵', creditCard: '💳', debitCard: '💳',
  savings: '🏦', prepaid: '🧾', investments: '📈',
  loan: '📉', credit: '💰', other: '📦',
};

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { currency, setCurrency, language, setLanguage } = useAppSettings();
  const [rates, setRates] = useState<{ USD: number; EUR: number } | null>(null);
  const [monoLoading, setMonoLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [waitingForMono, setWaitingForMono] = useState(false);
  const [monoStatus, setMonoStatus] = useState<{ linked: boolean; accounts: number } | null>(null);
  const waitingForMonoRef = useRef(false);
  const [monoQrUrl, setMonoQrUrl] = useState<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pendingRequestIdRef = useRef<string | null>(null);

  // Account picker state
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [pickerAccounts, setPickerAccounts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);

  // ── Load Monobank status ──────────────────────────────────────────────────
  const loadMonoStatus = async () => {
    try {
      const requestId = await SecureStore.getItemAsync('mono_request_id');
      const accounts = await apiFetch('/accounts');
      const monoAccounts = accounts.filter((a: any) => a.source === 'mono');
      setMonoStatus({ linked: monoAccounts.length > 0, accounts: monoAccounts.length });
    } catch {}
  };

  useEffect(() => {
    loadMonoStatus();
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json')
      .then(r => r.json())
      .then((data: any[]) => {
        const usd = data.find(r => r.cc === 'USD')?.rate;
        const eur = data.find(r => r.cc === 'EUR')?.rate;
        if (usd && eur) setRates({ USD: usd, EUR: eur });
      })
      .catch(() => {});
  }, []);

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
            await apiFetch(`/mono/sync-accounts?request_id=${requestId}`, { method: 'POST' }, { skipRedirect: true });
            const accounts = await apiFetch('/accounts');
            const monoAccs = accounts.filter((a: any) => a.source === 'mono');
            pendingRequestIdRef.current = requestId;
            setPickerAccounts(monoAccs);
            setSelectedIds(new Set(monoAccs.map((a: any) => a.id)));
            setShowAccountPicker(true);
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
    if (monoStatus?.linked) {
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          'Already linked',
          `You already have ${monoStatus.accounts} Monobank account${monoStatus.accounts !== 1 ? 's' : ''} connected. Relinking will replace them.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Relink', style: 'destructive', onPress: () => resolve(true) },
          ],
        )
      );
      if (!confirmed) return;
    }
    setMonoLoading(true);
    try {
      await apiFetch('/mono/corp/register-webhook', { method: 'POST' }).catch(() => {});
      const data = await apiFetch('/mono/auth/request', { method: 'POST' }, { skipRedirect: true });
      const url = data.acceptUrl ?? data.url;
      if (url) {
        if (data.tokenRequestId) {
          await SecureStore.setItemAsync('mono_request_id', data.tokenRequestId);
        }
        waitingForMonoRef.current = true;
        setWaitingForMono(true);
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          setMonoQrUrl(url);
        }
      } else {
        Alert.alert('Monobank', 'Request sent. Check the Monobank app to approve.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setMonoLoading(false);
    }
  };

  // ── Monobank: generate QR link ───────────────────────────────────────────
  const handleMonoQr = async () => {
    if (monoStatus?.linked) {
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          'Already linked',
          `You already have ${monoStatus.accounts} Monobank account${monoStatus.accounts !== 1 ? 's' : ''} connected. Relinking will replace them.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Relink', style: 'destructive', onPress: () => resolve(true) },
          ],
        )
      );
      if (!confirmed) return;
    }
    setMonoLoading(true);
    try {
      await apiFetch('/mono/corp/register-webhook', { method: 'POST' }, { skipRedirect: true }).catch(() => {});
      const data = await apiFetch('/mono/auth/request', { method: 'POST' }, { skipRedirect: true });
      const url = data.acceptUrl ?? data.url;
      if (!url) throw new Error('No URL returned from Monobank');
      if (data.tokenRequestId) {
        await SecureStore.setItemAsync('mono_request_id', data.tokenRequestId);
      }
      waitingForMonoRef.current = true;
      setWaitingForMono(true);
      setMonoQrUrl(url);
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
      await apiFetch(`/mono/sync-transactions?request_id=${requestId}`, { method: 'POST' }, { skipRedirect: true });
      Alert.alert('✅ Synced', 'New transactions imported.');
    } catch (e: any) {
      Alert.alert('Sync failed', e.message);
    } finally {
      setSyncLoading(false);
    }
  };

  // ── Confirm account selection ─────────────────────────────────────────────
  const handleConfirmAccounts = async () => {
    const requestId = pendingRequestIdRef.current;
    if (!requestId) return;
    setConfirming(true);
    try {
      // Delete accounts the user deselected
      const toDelete = pickerAccounts.filter(a => !selectedIds.has(a.id));
      await Promise.all(toDelete.map(a => apiFetch(`/accounts/${a.id}`, { method: 'DELETE' })));

      // Sync transactions only for kept accounts
      await apiFetch(`/mono/sync-transactions?request_id=${requestId}`, { method: 'POST' }, { skipRedirect: true });

      setShowAccountPicker(false);
      loadMonoStatus();
      Alert.alert('✅ Linked & Synced', `${selectedIds.size} account${selectedIds.size !== 1 ? 's' : ''} linked and transactions imported.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConfirming(false);
      pendingRequestIdRef.current = null;
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

  // ── Delete account ────────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      t('delete_account_data'),
      t('delete_account_data_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch('/users/me', { method: 'DELETE' });
              await SecureStore.deleteItemAsync('access_token');
              await SecureStore.deleteItemAsync('refresh_token');
              await SecureStore.deleteItemAsync('mono_request_id');
              router.replace('/auth');
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          },
        },
      ],
    );
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert(t('logout'), 'Are you sure?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'), style: 'destructive',
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
        <Text style={styles.headerTitle}>{t('settings')}</Text>
      </View>

      {/* ── System Currency ── */}
      <Text style={styles.sectionTitle}>{t('system_currency')}</Text>
      <View style={styles.card}>
        {([
          { c: 'UAH' as Currency, flag: '🇺🇦', name: 'Ukrainian Hryvnia', rate: '1.00 ₴' },
          { c: 'USD' as Currency, flag: '🇺🇸', name: 'US Dollar', rate: rates ? `${rates.USD.toFixed(2)} ₴` : '…' },
          { c: 'EUR' as Currency, flag: '🇪🇺', name: 'Euro', rate: rates ? `${rates.EUR.toFixed(2)} ₴` : '…' },
        ]).map(({ c, flag, name, rate }, i, arr) => (
          <TouchableOpacity
            key={c}
            style={[styles.optionRow, i < arr.length - 1 && styles.optionBorder]}
            onPress={() => setCurrency(c)}
          >
            <Text style={styles.currencyFlag}>{flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.currencyName}>{name}</Text>
              <Text style={styles.currencyRate}>{c}  ·  {rate}</Text>
            </View>
            <View style={[styles.radio, currency === c && styles.radioActive]}>
              {currency === c && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Language ── */}
      <Text style={styles.sectionTitle}>{t('language')}</Text>
      <View style={styles.card}>
        {([['en', '🇬🇧', 'english'], ['uk', '🇺🇦', 'ukrainian']] as [Language, string, string][]).map(([code, flag, key], i, arr) => (
          <TouchableOpacity
            key={code}
            style={[styles.optionRow, i < arr.length - 1 && styles.optionBorder]}
            onPress={() => setLanguage(code)}
          >
            <Text style={styles.optionLabel}>{flag} {t(key)}</Text>
            <View style={[styles.radio, language === code && styles.radioActive]}>
              {language === code && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Account ── */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <TouchableOpacity style={[styles.actionRow, styles.optionBorder]} onPress={() => setShowChangePw(true)}>
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>🔑</Text>
            <Text style={styles.actionLabel}>{t('change_password')}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount}>
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>🗑️</Text>
            <Text style={[styles.actionLabel, { color: '#c0392b' }]}>{t('delete_account_data')}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Monobank ── */}
      <Text style={styles.sectionTitle}>{t('monobank')}</Text>
      <View style={styles.card}>
        {/* Status banner */}
        {monoStatus && (
          <View style={[styles.monoStatus, { backgroundColor: monoStatus.linked ? '#f0fff4' : '#fff8f0' }]}>
            <Text style={styles.monoStatusDot}>{monoStatus.linked ? '🟢' : '🔴'}</Text>
            <Text style={[styles.monoStatusText, { color: monoStatus.linked ? '#27ae60' : '#e67e22' }]}>
              {monoStatus.linked
                ? `Connected · ${monoStatus.accounts} account${monoStatus.accounts !== 1 ? 's' : ''} synced`
                : 'Not connected — link your Monobank account below'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionRow, styles.optionBorder]}
          onPress={handleMonoLink}
          disabled={monoLoading || waitingForMono}
        >
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>📱</Text>
            <View>
              <Text style={styles.actionLabel}>
                {monoStatus?.linked ? 'Relink Monobank' : t('link_monobank')}
              </Text>
              {waitingForMono
                ? <Text style={styles.actionHint}>Waiting for approval in Monobank app…</Text>
                : <Text style={styles.actionHint}>Opens Monobank app to authorise access</Text>}
            </View>
          </View>
          {monoLoading || waitingForMono
            ? <ActivityIndicator color={BRAND} />
            : <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionRow, styles.optionBorder]}
          onPress={handleMonoQr}
          disabled={monoLoading || waitingForMono}
        >
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>📷</Text>
            <View>
              <Text style={styles.actionLabel}>Generate Link QR Code</Text>
              <Text style={styles.actionHint}>Use this if Monobank is not installed on this phone</Text>
            </View>
          </View>
          {monoLoading
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
            <View>
              <Text style={styles.actionLabel}>{t('sync_mono')}</Text>
              <Text style={styles.actionHint}>Manually pull last 30 days</Text>
            </View>
          </View>
          {syncLoading ? <ActivityIndicator color={BRAND} /> : <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Logout ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>MoneyMate v1.0</Text>
    </ScrollView>

    {/* ── Monobank QR Modal ── */}
    <Modal visible={!!monoQrUrl} animationType="fade" transparent onRequestClose={() => setMonoQrUrl(null)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { alignItems: 'center', paddingBottom: 36 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Scan with Monobank</Text>
          <Text style={[styles.actionHint, { textAlign: 'center', marginBottom: 28, fontSize: 13 }]}>
            Open the Monobank app on another device and scan this QR code to authorise access. Once approved, tap the button below.
          </Text>
          {monoQrUrl && (
            <QRCode value={monoQrUrl} size={220} />
          )}
          <View style={[styles.modalBtns, { marginTop: 28 }]}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setMonoQrUrl(null); setWaitingForMono(false); waitingForMonoRef.current = false; }}
            >
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, syncLoading && { opacity: 0.65 }]}
              disabled={syncLoading}
              onPress={async () => {
                const requestId = await SecureStore.getItemAsync('mono_request_id');
                if (!requestId) return;
                setMonoQrUrl(null);
                setSyncLoading(true);
                try {
                  await apiFetch(`/mono/sync-accounts?request_id=${requestId}`, { method: 'POST' }, { skipRedirect: true });
                  const accounts = await apiFetch('/accounts');
                  const monoAccs = accounts.filter((a: any) => a.source === 'mono');
                  if (monoAccs.length === 0) {
                    Alert.alert('Not approved yet', 'No accounts found. Please approve in the Monobank app first.');
                    return;
                  }
                  pendingRequestIdRef.current = requestId;
                  setPickerAccounts(monoAccs);
                  setSelectedIds(new Set(monoAccs.map((a: any) => a.id)));
                  setShowAccountPicker(true);
                } catch (e: any) {
                  Alert.alert('Sync failed', e.message);
                } finally {
                  setSyncLoading(false);
                  setWaitingForMono(false);
                  waitingForMonoRef.current = false;
                }
              }}
            >
              {syncLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>I approved — Sync</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* ── Account Picker Modal ── */}
    <Modal visible={showAccountPicker} animationType="slide" transparent onRequestClose={() => {}}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { paddingBottom: 32 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('choose_accounts')}</Text>
          <Text style={styles.pickerSubtitle}>Select which Monobank accounts to track. Others will be removed.</Text>

          {pickerAccounts.map((acc, i) => {
            const active = selectedIds.has(acc.id);
            return (
              <TouchableOpacity
                key={acc.id}
                style={[styles.accPickerRow, i < pickerAccounts.length - 1 && styles.optionBorder]}
                onPress={() => setSelectedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(acc.id)) next.delete(acc.id);
                  else next.add(acc.id);
                  return next;
                })}
                activeOpacity={0.7}
              >
                <Text style={styles.accPickerIcon}>{TYPE_ICON[acc.type] ?? '🏦'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accPickerName}>{acc.name}</Text>
                  <Text style={styles.accPickerBalance}>
                    {currencySymbol(acc.currency_code)}{(acc.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={[styles.checkbox, active && styles.checkboxActive]}>
                  {active && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={[styles.modalBtns, { marginTop: 20 }]}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                // User skipped — keep all, still sync transactions
                setShowAccountPicker(false);
                const rid = pendingRequestIdRef.current;
                if (rid) {
                  setSyncLoading(true);
                  apiFetch(`/mono/sync-transactions?request_id=${rid}`, { method: 'POST' }, { skipRedirect: true })
                    .then(() => { loadMonoStatus(); Alert.alert('✅ Synced', 'All accounts linked.'); })
                    .catch((e: any) => Alert.alert('Sync failed', e.message))
                    .finally(() => { setSyncLoading(false); pendingRequestIdRef.current = null; });
                }
              }}
            >
              <Text style={styles.cancelBtnText}>{t('skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (confirming || selectedIds.size === 0) && { opacity: 0.65 }]}
              onPress={handleConfirmAccounts}
              disabled={confirming || selectedIds.size === 0}
            >
              {confirming
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>{t('confirm')} ({selectedIds.size})</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* ── Change Password Modal ── */}
    <Modal visible={showChangePw} animationType="slide" transparent onRequestClose={() => setShowChangePw(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('change_password')}</Text>

          <Text style={styles.modalLabel}>{t('current_password')}</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter current password"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={currentPw}
            onChangeText={setCurrentPw}
          />

          <Text style={styles.modalLabel}>{t('new_password')}</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Min. 8 characters"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={newPw}
            onChangeText={setNewPw}
          />

          <Text style={styles.modalLabel}>{t('confirm_new_password')}</Text>
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
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, changePwLoading && { opacity: 0.65 }]} onPress={handleChangePassword} disabled={changePwLoading}>
              {changePwLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('update')}</Text>}
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
  currencyFlag: { fontSize: 22, marginRight: 12 },
  currencyName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  currencyRate: { fontSize: 12, color: '#aaa', marginTop: 1 },

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
  monoStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  monoStatusDot: { fontSize: 12 },
  monoStatusText: { fontSize: 13, fontWeight: '600', flex: 1 },
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

  pickerSubtitle: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18 },
  accPickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  accPickerIcon: { fontSize: 24 },
  accPickerName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  accPickerBalance: { fontSize: 13, color: '#888', marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2,
    borderColor: '#ddd', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: BRAND, borderColor: BRAND },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },

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
