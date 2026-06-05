import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, StatusBar, Modal,
  TextInput, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '@/components/AppContext';
import type { Transaction, Account } from '@/types';
import { BRAND, currencySymbol, CURRENCY_NAMES, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, CATEGORY_COLORS } from '@/constants/brand';
import { systemCurrencySymbol, CURRENCY_FLAGS } from '@/constants/displayCurrencies';
import SystemCurrencyPickerModal from '@/components/SystemCurrencyPickerModal';
import { useNbuRates } from '@/hooks/useNbuRates';
import { convertAmountToSystem, isoAlphacodeToNumeric, numericCodeToIso } from '@/utils/convertToSystemCurrency';
import { displayCategoryLabel, displayTxCategoryLabel } from '@/utils/categoryI18n';
import { parseAmountInput, sanitizeAmountInput } from '@/utils/amountInput';

const MCC_CATEGORIES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  grocery:    { label: 'Groceries',   icon: '🛒', color: '#27ae60', bg: '#e8f5e9' },
  restaurant: { label: 'Dining',      icon: '🍽️', color: '#e67e22', bg: '#fff3e0' },
  transport:  { label: 'Transport',   icon: '🚌', color: '#2980b9', bg: '#e3f2fd' },
  health:     { label: 'Health',      icon: '💊', color: '#e91e63', bg: '#fce4ec' },
  manual:     { label: 'Manual',      icon: '✏️', color: '#8B1A1A', bg: '#fff5f5' },
  other:      { label: 'Other',       icon: '💳', color: '#7f8c8d', bg: '#f5f5f5' },
};

function getMccCategory(mcc: number | null, source: string) {
  if (!mcc || mcc === 0 || source === 'manual') return MCC_CATEGORIES.manual;
  if (mcc >= 5411 && mcc <= 5499) return MCC_CATEGORIES.grocery;
  if (mcc >= 5811 && mcc <= 5814) return MCC_CATEGORIES.restaurant;
  if (mcc >= 4111 && mcc <= 4131) return MCC_CATEGORIES.transport;
  if (mcc >= 5912 && mcc <= 5999) return MCC_CATEGORIES.health;
  return MCC_CATEGORIES.other;
}

function formatDateTime(time: number, language: string) {
  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';
  const d = new Date(time < 1e10 ? time * 1000 : time);
  return {
    date: d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TransactionDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, currency } = useAppSettings();
  const { allRates, allRatesList } = useNbuRates();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Edit form state
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDateTime, setEditDateTime] = useState(new Date());
  const [editAccountId, setEditAccountId] = useState('');
  const [editCurrencyCc, setEditCurrencyCc] = useState('UAH');
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [showCustomCatInput, setShowCustomCatInput] = useState(false);
  const [customCatInput, setCustomCatInput] = useState('');
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showEditTimePicker, setShowEditTimePicker] = useState(false);
  const [showEditCurrencyPicker, setShowEditCurrencyPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [txs, accs] = await Promise.all([
        apiFetch('/transactions'),
        apiFetch('/accounts'),
      ]);
      const found = txs.find((t: Transaction) => String(t.id) === String(id));
      if (!found) { Alert.alert('Not found'); router.back(); return; }
      setTx(found);
      setEditDesc(found.description ?? '');
      setEditAmount(String(Math.abs(found.amount)));
      setEditDateTime(new Date(found.time < 1e10 ? found.time * 1000 : found.time));
      setEditAccountId(String(found.account_id));
      setEditCurrencyCc(numericCodeToIso(found.currency_code) ?? 'UAH');
      setEditCategory(found.category ?? null);
      setAccounts(accs);
      const acc = accs.find((a: Account) => a.id === found.account_id);
      setAccount(acc ?? null);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { fetchData(); }, []);

  const manualEntryAccounts = useMemo(
    () => accounts.filter(a => a.source !== 'mono'),
    [accounts],
  );

  useEffect(() => {
    if (!showEdit || manualEntryAccounts.length === 0) return;
    setEditAccountId(prev => {
      const ok = manualEntryAccounts.some(a => String(a.id) === prev);
      return ok ? prev : String(manualEntryAccounts[0].id);
    });
  }, [showEdit, manualEntryAccounts]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      t('delete_transaction'),
      t('delete_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
              router.back();
            } catch (e: any) {
              if (e instanceof SessionExpiredError) return;
              Alert.alert('Error', e.message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // ── Edit / Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    const parsed = parseAmountInput(editAmount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert(t('invalid_amount'), t('please_enter_positive_number'));
      return;
    }
    if (!tx) return;
    const currencyNum = isoAlphacodeToNumeric(editCurrencyCc);
    if (currencyNum == null) {
      Alert.alert(t('error'), t('transaction_currency_not_supported'));
      return;
    }
    setSaving(true);
    try {
      // Preserve original sign (expense stays negative, income stays positive)
      const newAmount = tx.amount < 0 ? -parsed : parsed;
      const updated = await apiFetch(`/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: editDesc,
          amount: newAmount,
          mcc: tx.mcc,
          currency_code: currencyNum,
          time: Math.floor(editDateTime.getTime() / 1000),
          account_id: parseInt(editAccountId),
          category: editCategory,
        }),
      });
      setTx(updated);
      setShowEdit(false);
      setShowEditCurrencyPicker(false);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>;
  }
  if (!tx) return null;

  const cat = getMccCategory(tx.mcc, tx.source);
  const { date, time: timeStr } = formatDateTime(tx.time, language);
  const isExpense = tx.amount < 0;
  const amountColor = isExpense ? '#c0392b' : '#27ae60';
  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';
  const amountSys = convertAmountToSystem(tx.amount, tx.currency_code, currency, allRates);
  const heroSym = amountSys !== null ? systemCurrencySymbol(currency) : currencySymbol(tx.currency_code);
  const heroAmount = amountSys !== null ? Math.abs(amountSys) : Math.abs(tx.amount);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>

        {/* ── Nav bar ── */}
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('transaction')}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* ── Amount Hero ── */}
        <View style={[styles.hero, { backgroundColor: cat.bg }]}>
          <Text style={styles.heroIcon}>{cat.icon}</Text>
          <Text style={[styles.heroAmount, { color: amountColor }]}>
            {isExpense ? '−' : '+'}{heroSym}{heroAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <View style={[styles.catBadge, { backgroundColor: cat.color + '20' }]}>
            <Text style={[styles.catBadgeText, { color: cat.color }]}>
              {displayTxCategoryLabel(tx, language, t)}
            </Text>
          </View>
        </View>

        {/* ── Details Card ── */}
        <View style={styles.card}>
          <DetailRow label={t('description')} value={tx.description || '—'} />
          <DetailRow label={t('date')} value={date} />
          <DetailRow label={t('time')} value={timeStr} />
          <DetailRow label={t('account')} value={account?.name ?? `Account #${tx.account_id}`} />
          <DetailRow label={t('currency')} value={CURRENCY_NAMES[tx.currency_code] ?? String(tx.currency_code)} />
          <DetailRow label={t('category')} value={displayTxCategoryLabel(tx, language, t)} />
          <DetailRow label={t('source')} value={tx.source} capitalize />
          {tx.mcc != null && tx.mcc > 0 && <DetailRow label={t('mcc_code')} value={String(tx.mcc)} last />}
        </View>

        {/* ── Edit note for Mono transactions ── */}
        {tx.source === 'mono' && (
          <View style={styles.monoNote}>
            <Text style={styles.monoNoteText}>
              ⚠️ {t('mono_edit_warning')}
            </Text>
          </View>
        )}

        {/* ── Action Buttons ── */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => setShowEdit(true)}>
            <Text style={styles.editBtnText}>{t('edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
            {deleting
              ? <ActivityIndicator color="#c0392b" size="small" />
              : <Text style={styles.deleteBtnText}>🗑  {t('delete')}</Text>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => { setShowEdit(false); setShowEditCurrencyPicker(false); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('edit_transaction')}</Text>

            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalLabel}>{t('amount')}</Text>
              <View style={[styles.amountRow, { borderColor: amountColor + '60' }]}>
                <Text style={[styles.amountSign, { color: amountColor }]}>
                  {isExpense ? '−' : '+'}
                </Text>
                <View style={styles.amountInputWrap}>
                  <TextInput
                    style={[styles.amountInput, { color: amountColor }]}
                    placeholder="0.00"
                    placeholderTextColor={amountColor + '40'}
                    keyboardType="decimal-pad"
                    value={editAmount}
                    onChangeText={(text) => setEditAmount(sanitizeAmountInput(text))}
                  />
                </View>
                <Pressable
                  style={[styles.amountCurrencyBtn, { borderColor: amountColor + '50' }]}
                  onPress={() => setShowEditCurrencyPicker(true)}
                  hitSlop={8}
                >
                  <Text style={styles.amountCurrencyBtnFlag}>{CURRENCY_FLAGS[editCurrencyCc] ?? '🏳️'}</Text>
                  <Text style={[styles.amountCurrencyBtnCode, { color: amountColor }]}>{editCurrencyCc}</Text>
                  <Text style={[styles.amountCurrencyBtnChevron, { color: amountColor }]}>›</Text>
                </Pressable>
              </View>

              <Text style={styles.modalLabel}>{t('description')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Coffee, Salary..."
                placeholderTextColor="#bbb"
                value={editDesc}
                onChangeText={setEditDesc}
              />

              <Text style={styles.modalLabel}>{t('date')} / {t('time')}</Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={[styles.pickerBtn, styles.pickerBtnHalf, showEditDatePicker && styles.pickerBtnActive]}
                  onPress={() => { setShowEditTimePicker(false); setShowEditDatePicker(v => !v); }}
                >
                  <Text style={styles.pickerBtnText} numberOfLines={1}>
                    {editDateTime.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickerBtn, styles.pickerBtnHalf, showEditTimePicker && styles.pickerBtnActive]}
                  onPress={() => { setShowEditDatePicker(false); setShowEditTimePicker(v => !v); }}
                >
                  <Text style={styles.pickerBtnText} numberOfLines={1}>
                    {editDateTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>
              {showEditDatePicker && (
                <AppDateTimePicker
                  value={editDateTime}
                  mode="date"
                  onChange={(_, selected) => {
                    setShowEditDatePicker(false);
                    if (selected) {
                      const updated = new Date(editDateTime);
                      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                      setEditDateTime(updated);
                    }
                  }}
                />
              )}
              {showEditTimePicker && (
                <AppDateTimePicker
                  value={editDateTime}
                  mode="time"
                  onChange={(_, selected) => {
                    setShowEditTimePicker(false);
                    if (selected) {
                      const updated = new Date(editDateTime);
                      updated.setHours(selected.getHours(), selected.getMinutes());
                      setEditDateTime(updated);
                    }
                  }}
                />
              )}

              <Text style={styles.modalLabel}>{t('account')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {manualEntryAccounts.map(acc => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accChip, editAccountId === String(acc.id) && styles.accChipActive]}
                    onPress={() => setEditAccountId(String(acc.id))}
                  >
                    <Text style={[styles.accChipText, editAccountId === String(acc.id) && styles.accChipTextActive]}>{acc.name}</Text>
                    <Text style={[styles.accChipSub, editAccountId === String(acc.id) && styles.accChipSubActive]}>{CURRENCY_NAMES[acc.currency_code] ?? ''}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Category */}
              <Text style={styles.modalLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {(isExpense ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES).map(c => {
                  const active = editCategory === c.label;
                  return (
                    <TouchableOpacity
                      key={c.label}
                      style={[styles.categoryChip, active && { backgroundColor: c.color, borderColor: c.color }]}
                      onPress={() => setEditCategory(active ? null : c.label)}
                    >
                      <Text style={styles.categoryChipIcon}>{c.icon}</Text>
                      <Text style={[styles.categoryChipText, active && { color: '#fff' }]}>
                        {displayCategoryLabel(c.label, t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {editCategory && !(isExpense ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES).find(c => c.label === editCategory) && (
                  <TouchableOpacity
                    style={[styles.categoryChip, { backgroundColor: BRAND, borderColor: BRAND }]}
                    onPress={() => setEditCategory(null)}
                  >
                    <Text style={styles.categoryChipIcon}>🏷️</Text>
                    <Text style={[styles.categoryChipText, { color: '#fff' }]}>{editCategory}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.categoryChip, styles.addCategoryChip]}
                  onPress={() => { setShowCustomCatInput(v => !v); setCustomCatInput(''); }}
                >
                  <Text style={styles.addCategoryText}>{t('add_category')}</Text>
                </TouchableOpacity>
              </ScrollView>

              {showCustomCatInput && (
                <View style={styles.customCatRow}>
                  <TextInput
                    style={styles.customCatInput}
                    placeholder="e.g. Pets, Hobbies..."
                    placeholderTextColor="#bbb"
                    value={customCatInput}
                    onChangeText={setCustomCatInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      const trimmed = customCatInput.trim();
                      if (trimmed) { setEditCategory(trimmed); }
                      setShowCustomCatInput(false);
                      setCustomCatInput('');
                    }}
                  />
                  <TouchableOpacity
                    style={styles.customCatConfirm}
                    onPress={() => {
                      const trimmed = customCatInput.trim();
                      if (trimmed) { setEditCategory(trimmed); }
                      setShowCustomCatInput(false);
                      setCustomCatInput('');
                    }}
                  >
                    <Text style={styles.customCatConfirmText}>{t('add')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowEdit(false); setShowEditCurrencyPicker(false); }}>
                  <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('save_changes')}</Text>}
                </TouchableOpacity>
              </View>
            </View>

            <SystemCurrencyPickerModal
              embedded
              visible={showEditCurrencyPicker}
              onClose={() => setShowEditCurrencyPicker(false)}
              rates={allRatesList}
              selectedCode={editCurrencyCc}
              onSelect={setEditCurrencyCc}
              titleKey="transaction_currency_sheet_title"
              subtitleKey="transaction_currency_sheet_sub"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Detail Row ────────────────────────────────────────────────────────────────
function DetailRow({ label, value, last, capitalize }: { label: string; value: string; last?: boolean; capitalize?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, capitalize && { textTransform: 'capitalize' }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' },

  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: { minWidth: 60, paddingRight: 8 },
  backText: { fontSize: 17, fontWeight: '600', color: BRAND },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  heroIcon: { fontSize: 52, marginBottom: 16 },
  heroAmount: { fontSize: 48, fontWeight: '800', letterSpacing: -1, marginBottom: 12 },
  catBadge: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20,
  },
  catBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  // Details card
  card: {
    backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  detailBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  detailLabel: { fontSize: 14, color: '#aaa', fontWeight: '500' },
  detailValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  // Mono note
  monoNote: {
    backgroundColor: '#fff8e1', borderRadius: 12, marginHorizontal: 16,
    padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ffe082',
  },
  monoNoteText: { fontSize: 13, color: '#f57f17', fontWeight: '500', lineHeight: 18 },

  // Action buttons
  actions: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 8 },
  editBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  editBtnText: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  deleteBtn: {
    flex: 1, backgroundColor: '#fff5f5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#ffcccc',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#c0392b' },

  // Edit modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  handle: { width: 36, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  formScroll: { flexGrow: 0, flexShrink: 1 },
  formContent: { paddingBottom: 4 },
  modalFooter: {
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, marginTop: 4,
  },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  modalInput: {
    backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#1a1a1a', borderWidth: 1.5, borderColor: '#eee', marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 8,
    marginBottom: 10, backgroundColor: '#fafafa',
  },
  amountSign: { fontSize: 24, fontWeight: '300', marginRight: 2, width: 24, textAlign: 'center', flexShrink: 0 },
  amountInputWrap: { flex: 1, minWidth: 0, marginRight: 4 },
  amountInput: { fontSize: 28, fontWeight: '800', paddingVertical: 8, paddingHorizontal: 2, width: '100%' },
  amountCurrencyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1.5,
    backgroundColor: '#fff', flexShrink: 0, zIndex: 2,
  },
  amountCurrencyBtnFlag: { fontSize: 16 },
  amountCurrencyBtnCode: { fontSize: 12, fontWeight: '800' },
  amountCurrencyBtnChevron: { fontSize: 16, fontWeight: '300' },

  dateTimeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pickerBtn: { backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#eee' },
  pickerBtnHalf: { flex: 1 },
  pickerBtnActive: { borderColor: BRAND, backgroundColor: BRAND + '10' },
  pickerBtnText: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },

  chipScroll: { marginBottom: 10 },
  accChip: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f0f0f0', marginRight: 8, alignItems: 'center', minWidth: 68 },
  accChipActive: { backgroundColor: BRAND },
  accChipText: { fontSize: 12, fontWeight: '700', color: '#444' },
  accChipTextActive: { color: '#fff' },
  accChipSub: { fontSize: 9, color: '#999', marginTop: 1, fontWeight: '600' },
  accChipSubActive: { color: 'rgba(255,255,255,0.7)' },

  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18,
    backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: '#e0e0e0', marginRight: 8,
  },
  categoryChipIcon: { fontSize: 13 },
  categoryChipText: { fontSize: 11, fontWeight: '600', color: '#444' },
  addCategoryChip: { backgroundColor: '#fff', borderColor: BRAND, borderStyle: 'dashed' },
  addCategoryText: { fontSize: 11, fontWeight: '700', color: BRAND },
  customCatRow: {
    flexDirection: 'row', gap: 8, marginBottom: 8,
    alignItems: 'center',
  },
  customCatInput: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: '#1a1a1a', borderWidth: 1.5, borderColor: '#eee',
  },
  customCatConfirm: {
    backgroundColor: BRAND, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  customCatConfirmText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#888' },
  saveBtn: {
    flex: 1, backgroundColor: BRAND, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
