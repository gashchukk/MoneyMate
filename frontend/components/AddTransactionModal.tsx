import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { useTranslation } from 'react-i18next';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import type { Account } from '@/types';
import { displayCategoryLabel } from '@/utils/categoryI18n';
import { monoAccountDisplayName } from '@/utils/monoAccountDisplayName';
import { CURRENCY_FLAGS, type NBURate } from '@/constants/displayCurrencies';
import SystemCurrencyPickerModal from '@/components/SystemCurrencyPickerModal';
import {
  BRAND,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  currencyName,
} from '@/constants/brand';
import { convertAmountBetweenCurrencies, isoAlphacodeToNumeric } from '@/utils/convertToSystemCurrency';
import { parseAmountInput, sanitizeAmountInput } from '@/utils/amountInput';

type TxMode = 'deposit' | 'withdrawal' | 'transfer';

const TX_MODES: { key: TxMode; label: string; icon: string; color: string }[] = [
  { key: 'deposit',    label: 'Deposit',    icon: '⬇️', color: '#27ae60' },
  { key: 'withdrawal', label: 'Withdrawal', icon: '⬆️', color: '#c0392b' },
  { key: 'transfer',   label: 'Transfer',   icon: '↔️', color: '#2980b9' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  allRates: Record<string, number>;
  allRatesList: NBURate[];
  onSuccess: () => void;
};

export default function AddTransactionModal({
  visible, onClose, accounts, allRates, allRatesList, onSuccess,
}: Props) {
  const { language, currency } = useAppSettings();
  const { t } = useTranslation();

  const [txMode, setTxMode] = useState<TxMode>('withdrawal');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputCurrencyCc, setInputCurrencyCc] = useState('UAH');
  const [showTxCurrencyPicker, setShowTxCurrencyPicker] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [localCategories, setLocalCategories] = useState<{ label: string; icon: string; color: string }[]>([]);

  const defaultCategories = txMode === 'deposit' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
  const allCategories = [...defaultCategories, ...localCategories];
  const activeModeConfig = TX_MODES.find(m => m.key === txMode)!;

  const manualEntryAccounts = useMemo(
    () => accounts.filter((a) => a.source !== 'mono'),
    [accounts],
  );

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
    setShowDatePicker(false);
    setShowTxCurrencyPicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (!visible) {
      setShowTxCurrencyPicker(false);
      return;
    }
    setInputCurrencyCc(currency);
  }, [visible, currency]);

  useEffect(() => {
    if (!visible || manualEntryAccounts.length === 0) return;
    const hasMain = manualEntryAccounts.some((a) => String(a.id) === accountId);
    if (!hasMain) {
      setAccountId(String(manualEntryAccounts[0].id));
    }
  }, [visible, manualEntryAccounts, accountId]);

  useEffect(() => {
    if (!visible || txMode !== 'transfer') return;
    if (manualEntryAccounts.length < 2) {
      if (toAccountId) setToAccountId('');
      return;
    }
    const others = manualEntryAccounts.filter((a) => String(a.id) !== accountId);
    const toOk = others.some((a) => String(a.id) === toAccountId);
    if (!toOk) {
      setToAccountId(String(others[0].id));
    }
  }, [visible, txMode, manualEntryAccounts, accountId, toAccountId]);

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (allCategories.find(c => c.label.toLowerCase() === name.toLowerCase())) {
      Alert.alert(t('already_exists'), t('category_already_exists'));
      return;
    }
    setLocalCategories(prev => [...prev, { label: name, icon: '🏷️', color: '#888' }]);
    setCategory(name);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const handleSubmit = async () => {
    const parsedAmount = parseAmountInput(amount);
    if (!amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(t('invalid_amount'), t('please_enter_positive_number')); return;
    }
    if (!accountId) { Alert.alert(t('missing_fields'), t('please_select_account')); return; }
    if (txMode === 'transfer') {
      if (!toAccountId) { Alert.alert(t('missing_fields'), t('please_select_account')); return; }
      if (accountId === toAccountId) { Alert.alert(t('missing_fields'), t('source_destination_must_differ')); return; }
    }

    setSaving(true);
    try {
      const inputNum = isoAlphacodeToNumeric(inputCurrencyCc);
      if (inputNum == null) {
        Alert.alert(t('error'), t('transaction_currency_not_supported'));
        return;
      }

      const txTime = Math.floor(date.getTime() / 1000);

      const toAccountCurrencyAmount = (accId: string, signedParsed: number) => {
        const acc = accounts.find((a) => String(a.id) === accId);
        if (!acc) return null;
        const accCc = acc.currency_code ?? 980;
        const mag = Math.abs(signedParsed);
        const conv =
          inputNum === accCc
            ? mag
            : convertAmountBetweenCurrencies(mag, inputNum, accCc, allRates);
        if (conv == null) return null;
        return signedParsed < 0 ? -conv : conv;
      };

      if (txMode === 'deposit') {
        const amt = toAccountCurrencyAmount(accountId, parsedAmount);
        if (amt == null) {
          Alert.alert(t('error'), t('rates_unavailable_conversion'));
          return;
        }
        const acc = accounts.find((a) => String(a.id) === accountId)!;
        const accCc = acc.currency_code ?? 980;
        await apiFetch('/transactions/manual', {
          method: 'POST',
          body: JSON.stringify({
            time: txTime,
            mcc: 0,
            currency_code: accCc,
            category,
            description: description || t('deposit'),
            amount: amt,
            account_id: parseInt(accountId, 10),
          }),
        });
      } else if (txMode === 'withdrawal') {
        const amt = toAccountCurrencyAmount(accountId, -parsedAmount);
        if (amt == null) {
          Alert.alert(t('error'), t('rates_unavailable_conversion'));
          return;
        }
        const acc = accounts.find((a) => String(a.id) === accountId)!;
        const accCc = acc.currency_code ?? 980;
        await apiFetch('/transactions/manual', {
          method: 'POST',
          body: JSON.stringify({
            time: txTime,
            mcc: 0,
            currency_code: accCc,
            category,
            description: description || t('withdrawal'),
            amount: amt,
            account_id: parseInt(accountId, 10),
          }),
        });
      } else {
        const fromName = accounts.find((a) => String(a.id) === accountId)?.name ?? 'account';
        const toName = accounts.find((a) => String(a.id) === toAccountId)?.name ?? 'account';
        const outAmt = toAccountCurrencyAmount(accountId, -parsedAmount);
        const inAmt = toAccountCurrencyAmount(toAccountId, parsedAmount);
        if (outAmt == null || inAmt == null) {
          Alert.alert(t('error'), t('rates_unavailable_conversion'));
          return;
        }
        const fromAcc = accounts.find((a) => String(a.id) === accountId)!;
        const toAcc = accounts.find((a) => String(a.id) === toAccountId)!;
        const fromCc = fromAcc.currency_code ?? 980;
        const toCc = toAcc.currency_code ?? 980;
        await Promise.all([
          apiFetch('/transactions/manual', {
            method: 'POST',
            body: JSON.stringify({
              time: txTime,
              mcc: 0,
              currency_code: fromCc,
              category: 'Transfer',
              description: description || `${t('transfer')} → ${toName}`,
              amount: outAmt,
              account_id: parseInt(accountId, 10),
            }),
          }),
          apiFetch('/transactions/manual', {
            method: 'POST',
            body: JSON.stringify({
              time: txTime,
              mcc: 0,
              currency_code: toCc,
              category: 'Transfer',
              description: description || `${t('transfer')} ← ${fromName}`,
              amount: inAmt,
              account_id: parseInt(toAccountId, 10),
            }),
          }),
        ]);
      }

      resetForm();
      onClose();
      onSuccess();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />

            <View style={styles.modeTabs}>
              {TX_MODES.map(mode => (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.modeTab, txMode === mode.key && { borderColor: mode.color, backgroundColor: mode.color + '18' }]}
                  onPress={() => { setTxMode(mode.key); setCategory(null); }}
                >
                  <Text style={styles.modeIcon}>{mode.icon}</Text>
                  <Text style={[styles.modeLabel, txMode === mode.key && { color: mode.color }]}>{t(mode.key)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.compactRow}>
                <View style={styles.compactField}>
                  <Text style={styles.modalLabel}>{t('date')}</Text>
                  <View style={styles.dateRow}>
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(v => !v)}>
                      <Text style={styles.dateText} numberOfLines={1}>
                        {date.toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dateTodayBtn}
                      onPress={() => { setDate(new Date()); setShowDatePicker(false); }}
                    >
                      <Text style={styles.dateTodayBtnText}>{t('today')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {showDatePicker && (
                <AppDateTimePicker
                  value={date}
                  mode="date"
                  maximumDate={new Date()}
                  onChange={(_, selected) => {
                    setShowDatePicker(false);
                    if (selected) setDate(selected);
                  }}
                />
              )}

              <Text style={styles.modalLabel}>{t('amount')}</Text>
              <View style={[styles.amountRow, { borderColor: activeModeConfig.color + '60' }]}>
                <Text style={[styles.amountSign, { color: activeModeConfig.color }]}>
                  {txMode === 'deposit' ? '+' : txMode === 'withdrawal' ? '−' : '↔'}
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: activeModeConfig.color }]}
                  placeholder="0.00"
                  placeholderTextColor={activeModeConfig.color + '40'}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(text) => setAmount(sanitizeAmountInput(text))}
                />
                <TouchableOpacity
                  style={[styles.amountCurrencyBtn, { borderColor: activeModeConfig.color + '50' }]}
                  onPress={() => setShowTxCurrencyPicker(true)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.amountCurrencyBtnFlag}>{CURRENCY_FLAGS[inputCurrencyCc] ?? '🏳️'}</Text>
                  <Text style={[styles.amountCurrencyBtnCode, { color: activeModeConfig.color }]}>{inputCurrencyCc}</Text>
                  <Text style={[styles.amountCurrencyBtnChevron, { color: activeModeConfig.color }]}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>{t('description_optional')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={txMode === 'deposit' ? t('description_placeholder_deposit') : txMode === 'withdrawal' ? t('description_placeholder_expense') : t('description_placeholder_transfer')}
                placeholderTextColor="#bbb"
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.modalLabel}>{txMode === 'transfer' ? t('from_account') : t('account')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {manualEntryAccounts.map(acc => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accChip, accountId === String(acc.id) && { backgroundColor: activeModeConfig.color }]}
                    onPress={() => setAccountId(String(acc.id))}
                  >
                    <Text style={[styles.accChipText, accountId === String(acc.id) && { color: '#fff' }]}>{monoAccountDisplayName(acc)}</Text>
                    <Text style={[styles.accChipCurrency, accountId === String(acc.id) && { color: 'rgba(255,255,255,0.7)' }]}>{currencyName(acc.currency_code)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {txMode === 'transfer' && (
                <>
                  <View style={styles.transferDivider}>
                    <Text style={styles.transferArrowText}>↓</Text>
                  </View>
                  <Text style={styles.modalLabel}>{t('to_account')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {manualEntryAccounts.filter(acc => String(acc.id) !== accountId).map(acc => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accChip, toAccountId === String(acc.id) && { backgroundColor: '#2980b9' }]}
                        onPress={() => setToAccountId(String(acc.id))}
                      >
                        <Text style={[styles.accChipText, toAccountId === String(acc.id) && { color: '#fff' }]}>{monoAccountDisplayName(acc)}</Text>
                        <Text style={[styles.accChipCurrency, toAccountId === String(acc.id) && { color: 'rgba(255,255,255,0.7)' }]}>{currencyName(acc.currency_code)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {txMode !== 'transfer' && (
                <>
                  <Text style={styles.modalLabel}>{t('category_optional')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
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
                          {displayCategoryLabel(cat.label, t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {!showNewCategory ? (
                      <TouchableOpacity style={styles.catChipNew} onPress={() => setShowNewCategory(true)}>
                        <Text style={styles.catChipIcon}>＋</Text>
                        <Text style={styles.catChipNewText}>{t('new_label')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </ScrollView>
                  {showNewCategory && (
                    <View style={styles.newCatRow}>
                      <TextInput
                        style={styles.newCatInput}
                        placeholder={t('category_name_placeholder')}
                        placeholderTextColor="#bbb"
                        value={newCategoryName}
                        onChangeText={setNewCategoryName}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleAddCategory}
                      />
                      <TouchableOpacity style={styles.newCatConfirm} onPress={handleAddCategory}>
                        <Text style={styles.newCatConfirmText}>{t('add_label')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.newCatCancel} onPress={() => { setShowNewCategory(false); setNewCategoryName(''); }}>
                        <Text style={styles.newCatCancelText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: activeModeConfig.color }, saving && { opacity: 0.65 }]}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.saveBtnText}>
                        {txMode === 'deposit' ? t('add_deposit') : txMode === 'withdrawal' ? t('add_expense') : t('add_transfer')}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SystemCurrencyPickerModal
        visible={showTxCurrencyPicker}
        onClose={() => setShowTxCurrencyPicker(false)}
        rates={allRatesList}
        selectedCode={inputCurrencyCc}
        onSelect={setInputCurrencyCc}
        titleKey="transaction_currency_sheet_title"
        subtitleKey="transaction_currency_sheet_sub"
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '92%',
  },
  handle: { width: 36, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  formScroll: { flexGrow: 0, flexShrink: 1 },
  formContent: { paddingBottom: 4 },
  modalFooter: {
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, marginTop: 4,
  },

  modeTabs: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  modeTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fafafa' },
  modeIcon: { fontSize: 16, marginBottom: 2 },
  modeLabel: { fontSize: 10, fontWeight: '700', color: '#bbb', letterSpacing: 0.2, textTransform: 'uppercase' },

  compactRow: { flexDirection: 'row', gap: 8 },
  compactField: { flex: 1 },

  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 8, marginBottom: 10, backgroundColor: '#fafafa' },
  amountSign: { fontSize: 24, fontWeight: '300', marginRight: 2, width: 24, textAlign: 'center' },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '800', paddingVertical: 8, paddingHorizontal: 4 },
  amountCurrencyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1.5,
    backgroundColor: '#fff', maxWidth: 100,
  },
  amountCurrencyBtnFlag: { fontSize: 16 },
  amountCurrencyBtnCode: { fontSize: 12, fontWeight: '800' },
  amountCurrencyBtnChevron: { fontSize: 16, fontWeight: '300' },

  modalLabel: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  modalInput: { backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1a1a1a', borderWidth: 1.5, borderColor: '#eee', marginBottom: 10 },

  chipScroll: { marginBottom: 10 },
  accChip: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f0f0f0', marginRight: 8, alignItems: 'center', minWidth: 72 },
  accChipText: { fontSize: 12, fontWeight: '700', color: '#444' },
  accChipCurrency: { fontSize: 9, color: '#999', marginTop: 1, fontWeight: '600' },

  transferDivider: { alignItems: 'center', marginVertical: 2, marginBottom: 8 },
  transferArrowText: { fontSize: 16, color: '#2980b9', fontWeight: '700' },

  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18,
    backgroundColor: '#f4f4f4', borderWidth: 1.5, borderColor: 'transparent', marginRight: 8,
  },
  catChipIcon: { fontSize: 13 },
  catChipText: { fontSize: 11, fontWeight: '600', color: '#555' },
  catChipNew: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#ddd', borderStyle: 'dashed', marginRight: 8,
  },
  catChipNewText: { fontSize: 11, fontWeight: '600', color: '#aaa' },
  newCatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  newCatInput: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#1a1a1a',
    borderWidth: 1.5, borderColor: '#eee',
  },
  newCatConfirm: { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  newCatConfirmText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  newCatCancel: { padding: 8 },
  newCatCancelText: { color: '#bbb', fontSize: 14 },

  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#888' },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  dateBtn: { flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#eee' },
  dateText: { fontSize: 14, color: '#1a1a1a' },
  dateTodayBtn: { backgroundColor: BRAND + '18', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: BRAND + '40' },
  dateTodayBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },
});
