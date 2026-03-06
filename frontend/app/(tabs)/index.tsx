import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t } from '@/components/AppContext';
import type { Transaction, Account } from '@/types';
import {
  BRAND,
  DEFAULT_CATEGORIES,
  currencySymbol,
  currencyName,
} from '@/constants/brand';

type TxMode = 'deposit' | 'withdrawal' | 'transfer';

const CATEGORY_META: Record<string, { icon: string; color: string }> = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.label, { icon: c.icon, color: c.color }])
);

function getCategoryMeta(cat?: string | null): { icon: string; color: string } {
  if (!cat) return { icon: '💳', color: '#bbb' };
  return CATEGORY_META[cat] ?? { icon: '🏷️', color: '#888' };
}

const mccColor = (mcc: number | null, category?: string | null): string => {
  const meta = getCategoryMeta(category);
  if (category && meta.color !== '#bbb') return meta.color + '18';
  if (!mcc) return '#f5f5f5';
  if (mcc >= 5411 && mcc <= 5499) return '#e8f5e9';
  if (mcc >= 5811 && mcc <= 5814) return '#fff3e0';
  if (mcc >= 4111 && mcc <= 4131) return '#e3f2fd';
  if (mcc >= 5912 && mcc <= 5999) return '#fce4ec';
  return '#f5f5f5';
};

const mccLabel = (mcc: number | null, category?: string | null): string => {
  if (category) return getCategoryMeta(category).icon;
  if (!mcc) return '✏️';
  if (mcc >= 5411 && mcc <= 5499) return '🛒';
  if (mcc >= 5811 && mcc <= 5814) return '🍽️';
  if (mcc >= 4111 && mcc <= 4131) return '🚌';
  if (mcc >= 5912 && mcc <= 5999) return '💊';
  return '💳';
};

const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_NAMES_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

const TX_MODES: { key: TxMode; label: string; icon: string; color: string }[] = [
  { key: 'deposit',    label: 'Deposit',    icon: '⬇️', color: '#27ae60' },
  { key: 'withdrawal', label: 'Withdrawal', icon: '⬆️', color: '#c0392b' },
  { key: 'transfer',   label: 'Transfer',   icon: '↔️', color: '#2980b9' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function TransactionsScreen() {
  const { language } = useAppSettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Form state
  const [txMode, setTxMode] = useState<TxMode>('withdrawal');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Custom category creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [customCategories, setCustomCategories] = useState<{ label: string; icon: string; color: string }[]>([]);

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setAccountId('');
    setToAccountId('');
    setCategory(null);
    setTxMode('withdrawal');
    setDate(new Date());
    setShowNewCategory(false);
    setNewCategoryName('');
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [txs, accs] = await Promise.all([apiFetch('/transactions'), apiFetch('/accounts')]);
      setTransactions(txs);
      setAccounts(accs);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // ── Add custom category ────────────────────────────────────────────────────
  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (allCategories.find(c => c.label.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already exists', 'A category with this name already exists.');
      return;
    }
    const newCat = { label: name, icon: '🏷️', color: '#888' };
    setCustomCategories(prev => [...prev, newCat]);
    setCategory(name);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive number.'); return;
    }
    if (!accountId) { Alert.alert('Missing account', 'Please select an account.'); return; }
    if (txMode === 'transfer') {
      if (!toAccountId) { Alert.alert('Missing account', 'Please select a destination account.'); return; }
      if (accountId === toAccountId) { Alert.alert('Invalid', 'Source and destination must differ.'); return; }
    }

    setSaving(true);
    try {
      const txTime = Math.floor(date.getTime() / 1000);
      const base = { time: txTime, mcc: 0, currency_code: null, category };

      if (txMode === 'deposit') {
        await apiFetch('/transactions/manual', {
          method: 'POST',
          body: JSON.stringify({ ...base, description: description || 'Deposit', amount: parsedAmount, account_id: parseInt(accountId) }),
        });
      } else if (txMode === 'withdrawal') {
        await apiFetch('/transactions/manual', {
          method: 'POST',
          body: JSON.stringify({ ...base, description: description || 'Withdrawal', amount: -parsedAmount, account_id: parseInt(accountId) }),
        });
      } else {
        const fromName = accounts.find(a => String(a.id) === accountId)?.name ?? 'account';
        const toName = accounts.find(a => String(a.id) === toAccountId)?.name ?? 'account';
        await Promise.all([
          apiFetch('/transactions/manual', { method: 'POST', body: JSON.stringify({ ...base, description: description || `Transfer → ${toName}`, amount: -parsedAmount, account_id: parseInt(accountId), category: 'Transfer' }) }),
          apiFetch('/transactions/manual', { method: 'POST', body: JSON.stringify({ ...base, description: description || `Transfer ← ${fromName}`, amount: parsedAmount, account_id: parseInt(toAccountId), category: 'Transfer' }) }),
        ]);
      }

      setShowModal(false);
      resetForm();
      fetchAll();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Month nav ──────────────────────────────────────────────────────────────
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // ── Group ──────────────────────────────────────────────────────────────────
  const monthTransactions = transactions.filter(tx => {
    const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const byDay: Record<string, Transaction[]> = {};
  monthTransactions.forEach(tx => {
    const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
    const key = d.toISOString().split('T')[0];
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(tx);
  });
  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
  sortedDays.forEach(day => byDay[day].sort((a, b) => b.time - a.time));
  const monthNames = language === 'uk' ? MONTH_NAMES_UK : MONTH_NAMES_EN;
  const activeModeConfig = TX_MODES.find(m => m.key === txMode)!;

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>;

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('transactions', language)}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* ── Month Switcher ── */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}><Text style={styles.monthArrowText}>‹</Text></TouchableOpacity>
        <Text style={styles.monthLabel}>{monthNames[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}><Text style={styles.monthArrowText}>›</Text></TouchableOpacity>
      </View>

      {/* ── List ── */}
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
              {byDay[day].map(tx => {
                const catMeta = getCategoryMeta(tx.category);
                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={[styles.txRow, { backgroundColor: mccColor(tx.mcc, tx.category) }]}
                    onPress={() => router.push(`/transaction/${tx.id}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.txIcon}>{mccLabel(tx.mcc, tx.category)}</Text>
                    <View style={styles.txMid}>
                      <Text style={styles.txDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                      {/* ── Metadata row: source + category ── */}
                      <View style={styles.txMeta}>
                        <Text style={styles.txSource}>{tx.source}</Text>
                        {tx.category && (
                          <>
                            <Text style={styles.txMetaDot}>·</Text>
                            <View style={[styles.catTag, { backgroundColor: catMeta.color + '22' }]}>
                              <Text style={[styles.catTagText, { color: catMeta.color }]}>
                                {catMeta.icon} {tx.category}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.txAmount, tx.amount < 0 ? styles.negative : styles.positive]}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} {currencySymbol(tx.currency_code)}
                    </Text>
                    <Text style={styles.txChevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Add Transaction Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />

            {/* Mode tabs */}
            <View style={styles.modeTabs}>
              {TX_MODES.map(mode => (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.modeTab, txMode === mode.key && { borderColor: mode.color, backgroundColor: mode.color + '18' }]}
                  onPress={() => setTxMode(mode.key)}
                >
                  <Text style={styles.modeIcon}>{mode.icon}</Text>
                  <Text style={[styles.modeLabel, txMode === mode.key && { color: mode.color }]}>{mode.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modeHint, { color: activeModeConfig.color }]}>
              {txMode === 'deposit' ? 'Money coming into an account' : txMode === 'withdrawal' ? 'Money spent from an account' : 'Move money between your accounts'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
              {/* Date */}
              <Text style={styles.modalLabel}>Date</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(v => !v)}>
                <Text style={styles.dateText}>
                  {date.toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_, selected) => {
                    setShowDatePicker(false);
                    if (selected) setDate(selected);
                  }}
                />
              )}

              {/* Amount */}
              <View style={[styles.amountRow, { borderColor: activeModeConfig.color + '60' }]}>
                <Text style={[styles.amountSign, { color: activeModeConfig.color }]}>
                  {txMode === 'deposit' ? '+' : txMode === 'withdrawal' ? '−' : '↔'}
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: activeModeConfig.color }]}
                  placeholder="0.00"
                  placeholderTextColor={activeModeConfig.color + '40'}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>

              {/* Description */}
              <Text style={styles.modalLabel}>Description (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={txMode === 'deposit' ? 'e.g. Salary, Gift...' : txMode === 'withdrawal' ? 'e.g. Coffee, Rent...' : 'e.g. Savings transfer...'}
                placeholderTextColor="#bbb"
                value={description}
                onChangeText={setDescription}
              />

              {/* Account */}
              <Text style={styles.modalLabel}>{txMode === 'transfer' ? 'From Account' : 'Account'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {accounts.map(acc => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accChip, accountId === String(acc.id) && { backgroundColor: activeModeConfig.color }]}
                    onPress={() => setAccountId(String(acc.id))}
                  >
                    <Text style={[styles.accChipText, accountId === String(acc.id) && { color: '#fff' }]}>{acc.name}</Text>
                    <Text style={[styles.accChipCurrency, accountId === String(acc.id) && { color: 'rgba(255,255,255,0.7)' }]}>{currencyName(acc.currency_code)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* To Account (transfer) */}
              {txMode === 'transfer' && (
                <>
                  <View style={styles.transferDivider}>
                    <View style={styles.transferLine} />
                    <Text style={styles.transferArrowText}>↓</Text>
                    <View style={styles.transferLine} />
                  </View>
                  <Text style={styles.modalLabel}>To Account</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {accounts.filter(acc => String(acc.id) !== accountId).map(acc => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accChip, toAccountId === String(acc.id) && { backgroundColor: '#2980b9' }]}
                        onPress={() => setToAccountId(String(acc.id))}
                      >
                        <Text style={[styles.accChipText, toAccountId === String(acc.id) && { color: '#fff' }]}>{acc.name}</Text>
                        <Text style={[styles.accChipCurrency, toAccountId === String(acc.id) && { color: 'rgba(255,255,255,0.7)' }]}>{currencyName(acc.currency_code)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* ── Category picker ── */}
              {txMode !== 'transfer' && (
                <>
                  <Text style={styles.modalLabel}>Category (optional)</Text>
                  <View style={styles.categoryGrid}>
                    {allCategories.map(cat => (
                      <TouchableOpacity
                        key={cat.label}
                        style={[
                          styles.catChip,
                          category === cat.label && { backgroundColor: cat.color, borderColor: cat.color },
                        ]}
                        onPress={() => setCategory(category === cat.label ? null : cat.label)}
                      >
                        <Text style={styles.catChipIcon}>{cat.icon}</Text>
                        <Text style={[styles.catChipText, category === cat.label && { color: '#fff' }]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    {/* ── Create new category ── */}
                    {!showNewCategory ? (
                      <TouchableOpacity
                        style={styles.catChipNew}
                        onPress={() => setShowNewCategory(true)}
                      >
                        <Text style={styles.catChipIcon}>＋</Text>
                        <Text style={styles.catChipNewText}>New</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.newCatRow}>
                        <TextInput
                          style={styles.newCatInput}
                          placeholder="Category name"
                          placeholderTextColor="#bbb"
                          value={newCategoryName}
                          onChangeText={setNewCategoryName}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={handleAddCategory}
                        />
                        <TouchableOpacity style={styles.newCatConfirm} onPress={handleAddCategory}>
                          <Text style={styles.newCatConfirmText}>Add</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.newCatCancel} onPress={() => { setShowNewCategory(false); setNewCategoryName(''); }}>
                          <Text style={styles.newCatCancelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </>
              )}


              {/* Buttons */}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowModal(false); resetForm(); }}>
                  <Text style={styles.cancelBtnText}>{t('cancel', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: activeModeConfig.color }, saving && { opacity: 0.65 }]}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.saveBtnText}>
                        {txMode === 'deposit' ? 'Add Deposit' : txMode === 'withdrawal' ? 'Add Expense' : 'Transfer'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  addBtn: { backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  monthArrow: { padding: 10 },
  monthArrowText: { fontSize: 26, color: BRAND, fontWeight: '300', lineHeight: 28 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', minWidth: 160, textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#aaa' },

  dayBlock: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  dayLabel: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayTotal: { fontSize: 14, fontWeight: '700' },

  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  txIcon: { fontSize: 22, marginRight: 12 },
  txMid: { flex: 1 },
  txDesc: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 3 },

  // ── Metadata row ──
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txSource: { fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4 },
  txMetaDot: { fontSize: 11, color: '#ccc' },
  catTag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  catTagText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },

  txAmount: { fontSize: 15, fontWeight: '700' },
  txChevron: { fontSize: 20, color: '#ccc', marginLeft: 8, fontWeight: '300' },
  negative: { color: '#c0392b' },
  positive: { color: '#27ae60' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '95%' },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeTab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fafafa' },
  modeIcon: { fontSize: 20, marginBottom: 4 },
  modeLabel: { fontSize: 11, fontWeight: '700', color: '#bbb', letterSpacing: 0.3, textTransform: 'uppercase' },
  modeHint: { fontSize: 12, fontWeight: '500', marginBottom: 20, textAlign: 'center', opacity: 0.8 },

  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 16, paddingHorizontal: 16, marginBottom: 20, backgroundColor: '#fafafa' },
  amountSign: { fontSize: 30, fontWeight: '300', marginRight: 6, width: 28, textAlign: 'center' },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800', paddingVertical: 14 },

  modalLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  modalInput: { backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1a1a1a', borderWidth: 1.5, borderColor: '#eee', marginBottom: 20 },

  chipScroll: { marginBottom: 16 },
  accChip: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f0f0f0', marginRight: 8, alignItems: 'center', minWidth: 80 },
  accChipText: { fontSize: 13, fontWeight: '700', color: '#444' },
  accChipCurrency: { fontSize: 10, color: '#999', marginTop: 2, fontWeight: '600' },

  transferDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, marginBottom: 16 },
  transferLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  transferArrowText: { fontSize: 20, color: '#2980b9', marginHorizontal: 12, fontWeight: '700' },

  // ── Category grid ──
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#f4f4f4',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  catChipIcon: { fontSize: 14 },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#555' },

  catChipNew: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: '#ddd', borderStyle: 'dashed',
  },
  catChipNewText: { fontSize: 12, fontWeight: '600', color: '#aaa' },

  // New category inline input
  newCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  newCatInput: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#1a1a1a',
    borderWidth: 1.5, borderColor: '#eee',
  },
  newCatConfirm: { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  newCatConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  newCatCancel: { padding: 10 },
  newCatCancelText: { color: '#bbb', fontSize: 16 },

  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#888' },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  dateBtn: { backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1.5, borderColor: '#eee', marginBottom: 20 },
  dateText: { fontSize: 15, color: '#1a1a1a' },
});