import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Linking,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t, Currency, Language } from '@/components/AppContext';

export default function SettingsScreen() {
  const { currency, setCurrency, language, setLanguage } = useAppSettings();
  const [monoLoading, setMonoLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // ── Monobank: request access ──────────────────────────────────────────────
  const handleMonoLink = async () => {
    setMonoLoading(true);
    try {
      const data = await apiFetch('/mono/auth/request', { method: 'POST' });
      // Monobank returns a URL to open so user can approve
      const url = data.acceptUrl ?? data.url;
      if (url) {
        await Linking.openURL(url);
        // Store request_id for sync
        if (data.tokenRequestId) {
          await SecureStore.setItemAsync('mono_request_id', data.tokenRequestId);
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

  // ── Monobank: sync accounts + transactions ────────────────────────────────
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

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert(t('logout', language), 'Are you sure?', [
      { text: t('cancel', language), style: 'cancel' },
      {
        text: t('logout', language), style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('mono_request_id');
          router.replace('/auth');
        },
      },
    ]);
  };

  return (
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

      {/* ── Monobank ── */}
      <Text style={styles.sectionTitle}>{t('monobank', language)}</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.actionRow, styles.optionBorder]}
          onPress={handleMonoLink}
          disabled={monoLoading}
        >
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>🟡</Text>
            <Text style={styles.actionLabel}>{t('link_monobank', language)}</Text>
          </View>
          {monoLoading ? <ActivityIndicator color={BRAND} /> : <Text style={styles.chevron}>›</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={handleMonoSync}
          disabled={syncLoading}
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
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BRAND = '#8B1A1A';

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
});
