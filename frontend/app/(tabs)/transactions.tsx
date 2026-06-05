import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import { useTranslation } from 'react-i18next';
import type { Transaction, Account } from '@/types';
import { displayTxCategoryLabel } from '@/utils/categoryI18n';
import { useNbuRates } from '@/hooks/useNbuRates';
import { convertAmountToSystem } from '@/utils/convertToSystemCurrency';
import { systemCurrencySymbol } from '@/constants/displayCurrencies';
import AddTransactionModal from '@/components/AddTransactionModal';
import {
  BRAND,
  DEFAULT_CATEGORIES,
  currencySymbol,
} from '@/constants/brand';

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function TransactionsScreen() {
  const { language, currency } = useAppSettings();
  const { allRates, allRatesList } = useNbuRates();
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [potentialTransfers, setPotentialTransfers] = useState<{ cashTx: Transaction; monoTx: Transaction }[]>([]);
  const [showTransferReview, setShowTransferReview] = useState(false);
  const [dismissedTransfers, setDismissedTransfers] = useState<Set<string>>(new Set());

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { scrollToDate } = useLocalSearchParams<{ scrollToDate?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const dayOffsets = useRef<Record<string, number>>({});
  const pendingScrollDate = useRef<string | null>(null);

  // When a scrollToDate param arrives, switch to that month and queue a scroll
  useEffect(() => {
    if (!scrollToDate) return;
    const d = new Date(scrollToDate);
    if (isNaN(d.getTime())) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    pendingScrollDate.current = scrollToDate;
  }, [scrollToDate]);

  // ── Transfer detection ─────────────────────────────────────────────────────
  const detectPotentialTransfers = useCallback((txs: Transaction[]) => {
    const THREE_DAYS = 3 * 86400;
    const cashWithdrawals = txs.filter(tx => tx.amount < 0 && tx.category !== 'Transfer' && tx.source !== 'mono');
    const monoDeposits    = txs.filter(tx => tx.amount > 0 && tx.category !== 'Transfer' && tx.source === 'mono');

    const pairs: { cashTx: Transaction; monoTx: Transaction }[] = [];
    const usedMono = new Set<number>();
    const usedCash = new Set<number>();

    for (const cashTx of cashWithdrawals) {
      for (const monoTx of monoDeposits) {
        if (usedMono.has(monoTx.id) || usedCash.has(cashTx.id)) continue;
        const amountMatch = Math.abs(Math.abs(cashTx.amount) - monoTx.amount) < 1.0;
        const timeDiff = Math.abs(cashTx.time - monoTx.time);
        if (amountMatch && timeDiff <= THREE_DAYS) {
          pairs.push({ cashTx, monoTx });
          usedMono.add(monoTx.id);
          usedCash.add(cashTx.id);
        }
      }
    }
    setPotentialTransfers(pairs);
  }, []);

  const confirmTransfer = async (cashTx: Transaction, monoTx: Transaction) => {
    try {
      await Promise.all([
        apiFetch(`/transactions/${cashTx.id}`, { method: 'PUT', body: JSON.stringify({ category: 'Transfer' }) }),
        apiFetch(`/transactions/${monoTx.id}`, { method: 'PUT', body: JSON.stringify({ category: 'Transfer' }) }),
      ]);
      setPotentialTransfers(prev => prev.filter(p => p.cashTx.id !== cashTx.id));
      fetchAll();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message);
    }
  };

  const dismissTransfer = (cashTx: Transaction, monoTx: Transaction) => {
    const key = `${cashTx.id}-${monoTx.id}`;
    setDismissedTransfers(prev => new Set([...prev, key]));
    setPotentialTransfers(prev => prev.filter(p => p.cashTx.id !== cashTx.id));
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [txs, accs] = await Promise.all([
        apiFetch('/transactions'),
        apiFetch('/accounts'),
      ]);
      setTransactions(txs);
      setAccounts(accs);
      detectPotentialTransfers(txs);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

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

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>;

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('transactions')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.addBtnText}>{t('add')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Month Switcher ── */}
      <View style={styles.monthRow}>
        <View style={styles.monthSide}>
          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
          >
            <Text style={styles.todayBtnText}>{t('today')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}><Text style={styles.monthArrowText}>‹</Text></TouchableOpacity>
        <Text style={styles.monthLabel}>{monthNames[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}><Text style={styles.monthArrowText}>›</Text></TouchableOpacity>
        <View style={styles.monthSide} />
      </View>

      {/* ── Potential transfers banner ── */}
      {potentialTransfers.length > 0 && (
        <TouchableOpacity style={styles.transferBanner} onPress={() => setShowTransferReview(true)} activeOpacity={0.8}>
          <Text style={styles.transferBannerIcon}>↔️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.transferBannerTitle}>{t('possible_transfers_found', { count: potentialTransfers.length })}</Text>
            <Text style={styles.transferBannerSub}>{t('tap_to_review_transfers')}</Text>
          </View>
          <Text style={styles.transferBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* ── Transfer review modal ── */}
      <Modal visible={showTransferReview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTransferReview(false)}>
        <View style={styles.reviewRoot}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewTitle}>{t('review_transfers')}</Text>
            <TouchableOpacity onPress={() => setShowTransferReview(false)}>
              <Text style={styles.reviewClose}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.reviewSub}>{t('merging_marks_both')}</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            {potentialTransfers.map(({ cashTx, monoTx }) => {
              const cashAcc = accounts.find(a => a.id === cashTx.account_id);
              const monoAcc = accounts.find(a => a.id === monoTx.account_id);
              const cashConv = convertAmountToSystem(cashTx.amount, cashTx.currency_code, currency, allRates);
              const monoConv = convertAmountToSystem(monoTx.amount, monoTx.currency_code, currency, allRates);
              const symCash = cashConv !== null ? systemCurrencySymbol(currency) : currencySymbol(cashTx.currency_code);
              const symMono = monoConv !== null ? systemCurrencySymbol(currency) : currencySymbol(monoTx.currency_code);
              const fmtDate = (tx: Transaction) => new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time)
                .toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'short' });
              return (
                <View key={`${cashTx.id}-${monoTx.id}`} style={styles.reviewCard}>
                  <View style={styles.reviewRow}>
                    <View style={styles.reviewTxBox}>
                      <Text style={styles.reviewTxLabel}>{t('cash_withdrawal')}</Text>
                      <Text style={styles.reviewTxAcc}>{cashAcc?.name ?? '—'}</Text>
                      <Text style={styles.reviewTxDate}>{fmtDate(cashTx)}</Text>
                      <Text style={[styles.reviewTxAmount, { color: '#c0392b' }]}>{symCash}{Math.abs(cashConv !== null ? cashConv : cashTx.amount).toFixed(2)}</Text>
                    </View>
                    <Text style={styles.reviewArrow}>→</Text>
                    <View style={styles.reviewTxBox}>
                      <Text style={styles.reviewTxLabel}>{t('mono_deposit')}</Text>
                      <Text style={styles.reviewTxAcc}>{monoAcc?.name ?? '—'}</Text>
                      <Text style={styles.reviewTxDate}>{fmtDate(monoTx)}</Text>
                      <Text style={[styles.reviewTxAmount, { color: '#27ae60' }]}>+{symMono}{(monoConv !== null ? monoConv : monoTx.amount).toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.reviewBtns}>
                    <TouchableOpacity style={styles.reviewDismissBtn} onPress={() => dismissTransfer(cashTx, monoTx)}>
                      <Text style={styles.reviewDismissText}>{t('not_a_transfer')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.reviewConfirmBtn} onPress={() => confirmTransfer(cashTx, monoTx)}>
                      <Text style={styles.reviewConfirmText}>{t('merge_as_transfer')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            {potentialTransfers.length === 0 && (
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
                <Text style={{ fontSize: 16, color: '#aaa' }}>{t('all_transfers_reviewed')}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── List ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={BRAND} />}
      >
        {sortedDays.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>{t('no_transactions')}</Text>
          </View>
        ) : sortedDays.map(day => {
          const date = new Date(day);
          const dayLabel = date.toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const dayTotal = byDay[day].reduce((s, tx) => {
            const c = convertAmountToSystem(tx.amount, tx.currency_code, currency, allRates);
            return s + (c ?? tx.amount);
          }, 0);
          return (
            <View
              key={day}
              style={styles.dayBlock}
              onLayout={(e) => {
                dayOffsets.current[day] = e.nativeEvent.layout.y;
                if (pendingScrollDate.current && day === pendingScrollDate.current.slice(0, 10)) {
                  const offset = e.nativeEvent.layout.y;
                  pendingScrollDate.current = null;
                  setTimeout(() => scrollRef.current?.scrollTo({ y: offset, animated: true }), 100);
                }
              }}
            >
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{dayLabel}</Text>
                <Text style={[styles.dayTotal, dayTotal < 0 ? styles.negative : styles.positive]}>
                  {systemCurrencySymbol(currency)}{dayTotal.toFixed(2)}
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
                                {catMeta.icon}{' '}
                                {displayTxCategoryLabel(tx, language, t)}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.txAmount, tx.amount < 0 ? styles.negative : styles.positive]}>
                      {(() => {
                        const c = convertAmountToSystem(tx.amount, tx.currency_code, currency, allRates);
                        const amt = c ?? tx.amount;
                        const sym = c !== null ? systemCurrencySymbol(currency) : currencySymbol(tx.currency_code);
                        const sign = amt > 0 ? '+' : amt < 0 ? '−' : '';
                        return `${sign}${sym}${Math.abs(amt).toFixed(2)}`;
                      })()}
                    </Text>
                    <Text style={styles.txChevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <AddTransactionModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        accounts={accounts}
        allRates={allRates}
        allRatesList={allRatesList}
        onSuccess={fetchAll}
      />
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

  monthRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  monthSide: { flex: 1, paddingLeft: 12 },
  monthArrow: { padding: 10 },
  monthArrowText: { fontSize: 26, color: BRAND, fontWeight: '300', lineHeight: 28 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', minWidth: 140, textAlign: 'center' },
  todayBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND + '50', alignSelf: 'flex-start' },
  todayBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },

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

  // Transfer banner
  transferBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff8e1', borderLeftWidth: 4, borderLeftColor: '#f5a623',
    marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 14,
  },
  transferBannerIcon: { fontSize: 22 },
  transferBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  transferBannerSub: { fontSize: 12, color: '#888', marginTop: 1 },
  transferBannerArrow: { fontSize: 22, color: '#f5a623', fontWeight: '700' },

  // Transfer review modal
  reviewRoot: { flex: 1, backgroundColor: '#F6F6F6' },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  reviewTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  reviewClose: { fontSize: 16, fontWeight: '600', color: BRAND },
  reviewSub: { fontSize: 13, color: '#888', paddingHorizontal: 20, paddingVertical: 12, lineHeight: 18 },
  reviewCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f0f0f0' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  reviewTxBox: { flex: 1, backgroundColor: '#F8F8F8', borderRadius: 12, padding: 12 },
  reviewTxLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', marginBottom: 4 },
  reviewTxAcc: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  reviewTxDate: { fontSize: 12, color: '#aaa', marginTop: 2 },
  reviewTxAmount: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  reviewArrow: { fontSize: 20, color: '#ccc', fontWeight: '700' },
  reviewBtns: { flexDirection: 'row', gap: 8 },
  reviewDismissBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0' },
  reviewDismissText: { fontSize: 13, fontWeight: '600', color: '#888' },
  reviewConfirmBtn: { flex: 2, borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: BRAND },
  reviewConfirmText: { fontSize: 13, fontWeight: '700', color: '#fff' },

});