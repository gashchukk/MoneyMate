import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t } from '@/components/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Transaction {
  id: number;
  account_id: number;
  time: number;
  description: string;
  amount: number;
  currency_code: number;
  mcc: number;
  source: string;
}

interface Account {
  id: number;
  name: string;
  currency_code: number;
}

// ── Currency helpers ──────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<number, string> = { 980: '₴', 840: '$', 978: '€', 826: '£' };
const CURRENCY_NAMES: Record<number, string> = { 980: 'UAH', 840: 'USD', 978: 'EUR', 826: 'GBP' };
const currencySymbol = (code: number) => CURRENCY_SYMBOLS[code] ?? '?';
const currencyName = (code: number) => CURRENCY_NAMES[code] ?? String(code);

// ── MCC category colors ───────────────────────────────────────────────────────
const mccColor = (mcc: number): string => {
  if (mcc >= 5411 && mcc <= 5499) return '#e8f5e9'; // groceries - green
  if (mcc >= 5811 && mcc <= 5814) return '#fff3e0'; // restaurants - orange
  if (mcc >= 4111 && mcc <= 4131) return '#e3f2fd'; // transport - blue
  if (mcc >= 5912 && mcc <= 5999) return '#fce4ec'; // health - pink
  return '#f5f5f5';
};

const mccLabel = (mcc: number): string => {
  if (mcc >= 5411 && mcc <= 5499) return '🛒';
  if (mcc >= 5811 && mcc <= 5814) return '🍽️';
  if (mcc >= 4111 && mcc <= 4131) return '🚌';
  if (mcc >= 5912 && mcc <= 5999) return '💊';
  if (mcc === 0) return '✏️';
  return '💳';
};

const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_NAMES_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

export default function TransactionsScreen() {
  const { language } = useAppSettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Month navigation
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // Add transaction form
  const [form, setForm] = useState({
    description: '',
    amount: '',
    account_id: '',
    currency_code: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [txs, accs] = await Promise.all([
        apiFetch('/transactions'),
        apiFetch('/accounts'),
      ]);
      setTransactions(txs);
      setAccounts(accs);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  // Filter transactions for selected month
  const monthTransactions = transactions.filter(tx => {
    const d = new Date(typeof tx.time === 'number' && tx.time < 1e10 ? tx.time * 1000 : tx.time);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // Group by day
  const byDay: Record<string, Transaction[]> = {};
  monthTransactions.forEach(tx => {
    const d = new Date(typeof tx.time === 'number' && tx.time < 1e10 ? tx.time * 1000 : tx.time);
    const key = d.toISOString().split('T')[0];
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(tx);
  });
  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleAddTransaction = async () => {
    if (!form.description || !form.amount || !form.account_id) {
      Alert.alert('Missing fields', 'Please fill description, amount and account.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/transactions/manual', {
        method: 'POST',
        body: JSON.stringify({
          description: form.description,
          amount: parseFloat(form.amount),
          account_id: parseInt(form.account_id),
          time: Math.floor(Date.now() / 1000),
          mcc: 0,
          currency_code: form.currency_code ? parseInt(form.currency_code) : null,
        }),
      });
      setShowModal(false);
      setForm({ description: '', amount: '', account_id: '', currency_code: '' });
      fetchAll();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const monthNames = language === 'uk' ? MONTH_NAMES_UK : MONTH_NAMES_EN;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('transactions', language)}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.addBtnText}>+ {t('add_transaction', language)}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Month Switcher ── */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthNames[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Transaction List ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={BRAND} />}
      >
        {sortedDays.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>{t('no_transactions', language)}</Text>
          </View>
        ) : sortedDays.map(day => {
          const date = new Date(day);
          const dayLabel = date.toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const dayTotal = byDay[day].reduce((s, tx) => s + tx.amount, 0);
          return (
            <View key={day} style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{dayLabel}</Text>
                <Text style={[styles.dayTotal, dayTotal < 0 ? styles.negative : styles.positive]}>
                  {dayTotal > 0 ? '+' : ''}{dayTotal.toFixed(2)}
                </Text>
              </View>
              {byDay[day].map(tx => (
                <View key={tx.id} style={[styles.txRow, { backgroundColor: mccColor(tx.mcc) }]}>
                  <Text style={styles.txIcon}>{mccLabel(tx.mcc)}</Text>
                  <View style={styles.txMid}>
                    <Text style={styles.txDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                    <Text style={styles.txSource}>{tx.source}</Text>
                  </View>
                  <Text style={[styles.txAmount, tx.amount < 0 ? styles.negative : styles.positive]}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} {currencySymbol(tx.currency_code)}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Add Transaction Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('add_transaction', language)}</Text>

            <Text style={styles.modalLabel}>{t('description', language)}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Coffee"
              placeholderTextColor="#bbb"
              value={form.description}
              onChangeText={v => setForm(f => ({ ...f, description: v }))}
            />

            <Text style={styles.modalLabel}>{t('amount', language)}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="-50.00  (negative = expense)"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              value={form.amount}
              onChangeText={v => setForm(f => ({ ...f, amount: v }))}
            />

            <Text style={styles.modalLabel}>{t('account', language)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {accounts.map(acc => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.accChip, form.account_id === String(acc.id) && styles.accChipActive]}
                  onPress={() => setForm(f => ({ ...f, account_id: String(acc.id) }))}
                >
                  <Text style={[styles.accChipText, form.account_id === String(acc.id) && styles.accChipTextActive]}>
                    {acc.name} · {currencyName(acc.currency_code)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddTransaction} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('save', language)}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BRAND = '#8B1A1A';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#fff',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  addBtn: {
    backgroundColor: BRAND, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  monthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  monthArrow: { padding: 10 },
  monthArrowText: { fontSize: 26, color: BRAND, fontWeight: '300', lineHeight: 28 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', minWidth: 160, textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#aaa' },

  dayBlock: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  dayLabel: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayTotal: { fontSize: 14, fontWeight: '700' },

  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  txIcon: { fontSize: 22, marginRight: 12 },
  txMid: { flex: 1 },
  txDesc: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  txSource: { fontSize: 11, color: '#aaa', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  txAmount: { fontSize: 15, fontWeight: '700' },

  negative: { color: '#c0392b' },
  positive: { color: '#27ae60' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7 },
  modalInput: {
    backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: '#1a1a1a',
    borderWidth: 1.5, borderColor: '#eee', marginBottom: 18,
  },
  accChip: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#f0f0f0', marginRight: 8,
  },
  accChipActive: { backgroundColor: BRAND },
  accChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  accChipTextActive: { color: '#fff' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#888' },
  saveBtn: {
    flex: 1, backgroundColor: BRAND, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
