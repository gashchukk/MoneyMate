import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import type { Transaction, Account } from '@/types';
import { BRAND, DEFAULT_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES, currencySymbol } from '@/constants/brand';
import {
  monthKey,
  loadBudgetStore,
  loadBudgetCategoriesConfig,
  type BudgetStore,
  type BudgetCategoriesConfig,
} from '@/constants/budget';
import { useNbuRates } from '@/hooks/useNbuRates';
import { convertAmountToSystem } from '@/utils/convertToSystemCurrency';
import { systemCurrencySymbol } from '@/constants/displayCurrencies';
import { displayCategoryLabel, displayTxCategoryLabel } from '@/utils/categoryI18n';
import { monoAccountDisplayName } from '@/utils/monoAccountDisplayName';
import AddTransactionModal from '@/components/AddTransactionModal';

const SOURCE_ICON: Record<string, string> = { mono: '🟡', manual: '✏️', default: '🏦' };
const TYPE_ICON: Record<string, string> = {
  black: '🖤', white: '🤍', platinum: '🔘', iron: '⚙️', fop: '🏢',
  yellow: '🇺🇦', eAid: '🟢', cash: '💵', creditCard: '💳', debitCard: '💳',
  savings: '🏦', prepaid: '🧾', investments: '📈', loan: '📉', credit: '💰', other: '📦',
};

const CATEGORY_META: Record<string, { icon: string; color: string }> = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.label, { icon: c.icon, color: c.color }]),
);

function getCategoryMeta(cat?: string | null): { icon: string; color: string } {
  if (!cat) return { icon: '💳', color: '#bbb' };
  return CATEGORY_META[cat] ?? { icon: '🏷️', color: '#888' };
}

function txAbsInSystem(tx: Transaction, currency: string, allRates: Record<string, number>): number {
  const c = convertAmountToSystem(Math.abs(tx.amount), tx.currency_code, currency, allRates);
  return c ?? Math.abs(tx.amount);
}

function txInSystem(tx: Transaction, currency: string, allRates: Record<string, number>): number {
  const c = convertAmountToSystem(tx.amount, tx.currency_code, currency, allRates);
  return c ?? tx.amount;
}

function MiniBarChart({ data, color, sym }: { data: { label: string; value: number }[]; color: string; sym: string }) {
  const max = data.reduce((m, d) => Math.max(m, Math.abs(d.value)), 1);
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0);
  return (
    <View style={chartStyles.root}>
      {data.map((d, i) => (
        <View key={i} style={chartStyles.barCol}>
          <Text style={[chartStyles.barValue, { color }]}>
            {Math.abs(d.value) > 0 ? `${sym}${fmt(Math.abs(d.value))}` : ''}
          </Text>
          <View style={chartStyles.barTrack}>
            <View style={[chartStyles.bar, { height: `${(Math.abs(d.value) / max) * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={chartStyles.barLabel} numberOfLines={1}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 7, fontWeight: '700', marginBottom: 2, textAlign: 'center' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  bar: { borderRadius: 4, minHeight: 2 },
  barLabel: { fontSize: 8, color: '#aaa', marginTop: 4, textAlign: 'center' },
});

function WidgetHeader({ title, onViewAll }: { title: string; onViewAll: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.widgetHeader}>
      <Text style={styles.widgetTitle}>{title}</Text>
      <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.viewAll}>{t('view_all')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { language, currency } = useAppSettings();
  const { allRates, allRatesList } = useNbuRates();
  const [showAddModal, setShowAddModal] = useState(false);
  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetStore, setBudgetStore] = useState<BudgetStore>({});
  const [budgetCategoriesConfig, setBudgetCategoriesConfig] = useState<BudgetCategoriesConfig>({ visible: [], custom: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [txs, accs, store, config] = await Promise.all([
        apiFetch('/transactions'),
        apiFetch('/accounts'),
        loadBudgetStore(),
        loadBudgetCategoriesConfig(),
      ]);
      setTransactions(txs);
      setAccounts(accs);
      setBudgetStore(store);
      setBudgetCategoriesConfig(config);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const sym = systemCurrencySymbol(currency);
  const fmt = (v: number) => `${sym}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const personalBalance = (acc: Account) => (acc.balance ?? 0) - (acc.credit_limit ?? 0);

  const totalBalance = useMemo(() =>
    accounts.reduce((sum, acc) =>
      sum + (convertAmountToSystem(acc.balance ?? 0, acc.currency_code, currency, allRates) ?? 0), 0),
    [accounts, currency, allRates],
  );

  const topAccounts = useMemo(() =>
    [...accounts]
      .sort((a, b) =>
        (convertAmountToSystem(b.balance ?? 0, b.currency_code, currency, allRates) ?? 0) -
        (convertAmountToSystem(a.balance ?? 0, a.currency_code, currency, allRates) ?? 0),
      )
      .slice(0, 3),
    [accounts, currency, allRates],
  );

  const recentTransactions = useMemo(() =>
    [...transactions]
      .sort((a, b) => b.time - a.time)
      .slice(0, 5),
    [transactions],
  );

  const isInternal = (tx: Transaction) => tx.category === 'Transfer' || tx.category === 'Correction';

  const monthStats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthTxs = transactions.filter(tx => {
      const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
      return d.getFullYear() === y && d.getMonth() === m;
    });
    const expenses = monthTxs.filter(tx => tx.amount < 0 && !isInternal(tx));
    const income = monthTxs.filter(tx => tx.amount > 0 && !isInternal(tx));
    const totalExpenses = expenses.reduce((s, tx) => s + txAbsInSystem(tx, currency, allRates), 0);
    const totalIncome = income.reduce((s, tx) => s + Math.max(0, txInSystem(tx, currency, allRates)), 0);
    const net = totalIncome - totalExpenses;

    const catMap: Record<string, number> = {};
    expenses.forEach(tx => {
      const key = tx.category ?? 'Other';
      catMap[key] = (catMap[key] ?? 0) + txAbsInSystem(tx, currency, allRates);
    });
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

    return { totalExpenses, totalIncome, net, topCat, txCount: monthTxs.length };
  }, [transactions, currency, allRates]);

  const monthlyTrend = useMemo(() => {
    const months: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
    }
    transactions.forEach(tx => {
      if (tx.amount >= 0 || isInternal(tx)) return;
      const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key] === undefined) return;
      months[key] += txAbsInSystem(tx, currency, allRates);
    });
    return Object.entries(months).map(([key, value]) => ({
      label: new Date(key + '-01').toLocaleDateString(locale, { month: 'short' }),
      value,
    }));
  }, [transactions, locale, currency, allRates]);

  const monthLabel = new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const budgetCategoryMeta = useMemo(() => {
    const map = Object.fromEntries(
      DEFAULT_EXPENSE_CATEGORIES.map(c => [c.label, { icon: c.icon, color: c.color }]),
    );
    budgetCategoriesConfig.custom.forEach(c => { map[c.label] = { icon: c.icon, color: c.color }; });
    return map;
  }, [budgetCategoriesConfig.custom]);

  const budgetSummary = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthLimits = budgetStore[monthKey(now)] ?? {};

    const spentByCat: Record<string, number> = {};
    transactions.forEach(tx => {
      const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
      if (d.getFullYear() !== y || d.getMonth() !== m || tx.amount >= 0 || isInternal(tx)) return;
      const key = tx.category ?? 'Other';
      spentByCat[key] = (spentByCat[key] ?? 0) + txAbsInSystem(tx, currency, allRates);
    });

    const rows = budgetCategoriesConfig.visible.map(key => {
      const meta = budgetCategoryMeta[key] ?? { icon: '🏷️', color: '#888' };
      return {
        key,
        icon: meta.icon,
        color: meta.color,
        spent: spentByCat[key] ?? 0,
        limit: monthLimits[key] ?? null,
      };
    });

    const withLimits = rows.filter(r => r.limit != null);
    const totalBudget = withLimits.reduce((s, r) => s + (r.limit ?? 0), 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const topRows = [...withLimits]
      .sort((a, b) => (b.spent / (b.limit ?? 1)) - (a.spent / (a.limit ?? 1)))
      .slice(0, 3);
    const overCount = withLimits.filter(r => r.spent > (r.limit ?? 0)).length;

    return { totalBudget, totalSpent, topRows, overCount, hasLimits: withLimits.length > 0 };
  }, [transactions, budgetStore, budgetCategoriesConfig.visible, budgetCategoryMeta, currency, allRates]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>;
  }

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={BRAND} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{t('home')}</Text>
          <Text style={styles.headerSub}>{t('home_subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>{t('add')}</Text>
        </TouchableOpacity>
      </View>

      {/* Balance widget */}
      <View style={styles.widget}>
        <WidgetHeader title={t('accounts_overview')} onViewAll={() => router.push('/(tabs)/accounts')} />
        <View style={styles.balanceHero}>
          <Text style={styles.balanceLabel}>{t('total_balance')}</Text>
          <Text style={styles.balanceAmount}>{fmt(totalBalance)}</Text>
          <Text style={styles.balanceCurrency}>{currency}</Text>
        </View>
        {topAccounts.length === 0 ? (
          <Text style={styles.emptyHint}>{t('no_accounts_yet')}</Text>
        ) : topAccounts.map(acc => {
          const balSys = convertAmountToSystem(acc.balance ?? 0, acc.currency_code, currency, allRates);
          return (
            <TouchableOpacity
              key={acc.id}
              style={styles.accountRow}
              onPress={() => router.push(`/account/${acc.id}`)}
              activeOpacity={0.75}
            >
              <Text style={styles.accountIcon}>
                {TYPE_ICON[acc.type] ?? SOURCE_ICON[acc.source] ?? SOURCE_ICON.default}
              </Text>
              <View style={styles.accountMid}>
                <Text style={styles.accountName} numberOfLines={1}>{monoAccountDisplayName(acc)}</Text>
                {(acc.credit_limit ?? 0) > 0 && (
                  <Text style={styles.accountMeta}>
                    {t('personal')} {fmt(convertAmountToSystem(personalBalance(acc), acc.currency_code, currency, allRates) ?? personalBalance(acc))}
                  </Text>
                )}
              </View>
              <Text style={[styles.accountBal, (acc.balance ?? 0) < 0 && styles.negative]}>
                {balSys !== null ? fmt(balSys) : `${currencySymbol(acc.currency_code)}${(acc.balance ?? 0).toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Analytics widget */}
      <View style={styles.widget}>
        <WidgetHeader title={t('monthly_overview')} onViewAll={() => router.push('/(tabs)/analytics')} />
        <Text style={styles.periodLabel}>{monthLabel}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('income')}</Text>
            <Text style={[styles.statValue, styles.positive]}>{fmt(monthStats.totalIncome)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('expenses')}</Text>
            <Text style={[styles.statValue, styles.negative]}>{fmt(monthStats.totalExpenses)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('net_balance')}</Text>
            <Text style={[styles.statValue, monthStats.net >= 0 ? styles.positive : styles.negative]}>
              {monthStats.net >= 0 ? '+' : '−'}{fmt(monthStats.net)}
            </Text>
          </View>
        </View>
        {monthStats.topCat && (
          <View style={styles.topCatRow}>
            <Text style={styles.topCatLabel}>{t('top_category_label')}</Text>
            <Text style={styles.topCatValue}>
              {getCategoryMeta(monthStats.topCat[0]).icon}{' '}
              {displayCategoryLabel(monthStats.topCat[0], t)} · {fmt(monthStats.topCat[1])}
            </Text>
          </View>
        )}
        <Text style={styles.chartTitle}>{t('trend_6_months')}</Text>
        <MiniBarChart data={monthlyTrend} color="#c0392b" sym={sym} />
        <Text style={styles.txCountHint}>
          {t('transactions_in_period', { count: monthStats.txCount })}
        </Text>
      </View>

      {/* Budget widget */}
      <View style={styles.widget}>
        <WidgetHeader title={t('budget')} onViewAll={() => router.push('/(tabs)/budget')} />
        <Text style={styles.periodLabel}>{monthLabel}</Text>
        {budgetSummary.hasLimits ? (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t('total_budget')}</Text>
                <Text style={styles.statValue}>{sym}{budgetSummary.totalBudget.toFixed(0)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t('total_spent')}</Text>
                <Text style={[styles.statValue, styles.negative]}>{sym}{budgetSummary.totalSpent.toFixed(0)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t('remaining')}</Text>
                <Text style={[styles.statValue, budgetSummary.totalBudget - budgetSummary.totalSpent >= 0 ? styles.positive : styles.negative]}>
                  {budgetSummary.totalBudget - budgetSummary.totalSpent >= 0 ? '' : '−'}
                  {sym}{Math.abs(budgetSummary.totalBudget - budgetSummary.totalSpent).toFixed(0)}
                </Text>
              </View>
            </View>
            {budgetSummary.topRows.map(row => {
              const pct = Math.min((row.spent / row.limit!) * 100, 100);
              const over = row.spent > row.limit!;
              const barColor = over ? '#c0392b' : pct >= 80 ? '#e67e22' : row.color;
              return (
                <View key={row.key} style={styles.budgetRow}>
                  <View style={styles.budgetRowTop}>
                    <Text style={styles.budgetRowIcon}>{row.icon}</Text>
                    <Text style={styles.budgetRowName} numberOfLines={1}>{displayCategoryLabel(row.key, t)}</Text>
                    <Text style={[styles.budgetRowAmount, over && styles.negative]}>
                      {sym}{row.spent.toFixed(0)} / {sym}{row.limit!.toFixed(0)}
                    </Text>
                  </View>
                  <View style={styles.budgetTrack}>
                    <View style={[styles.budgetBar, { width: `${pct}%`, backgroundColor: barColor }]} />
                  </View>
                </View>
              );
            })}
            {budgetSummary.overCount > 0 && (
              <Text style={styles.budgetOverHint}>{t('over_budget_count', { count: budgetSummary.overCount })}</Text>
            )}
          </>
        ) : (
          <Text style={styles.emptyHint}>{t('budget_home_empty')}</Text>
        )}
      </View>

      {/* Recent transactions widget */}
      <View style={styles.widget}>
        <WidgetHeader title={t('recent_transactions')} onViewAll={() => router.push('/(tabs)/transactions')} />
        {recentTransactions.length === 0 ? (
          <Text style={styles.emptyHint}>{t('no_transactions_yet')}</Text>
        ) : recentTransactions.map(tx => {
          const catMeta = getCategoryMeta(tx.category);
          const conv = convertAmountToSystem(tx.amount, tx.currency_code, currency, allRates);
          const amt = conv ?? tx.amount;
          const txSym = conv !== null ? sym : currencySymbol(tx.currency_code);
          const date = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
          const dateStr = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
          return (
            <TouchableOpacity
              key={tx.id}
              style={styles.txRow}
              onPress={() => router.push(`/transaction/${tx.id}`)}
              activeOpacity={0.7}
            >
              <Text style={styles.txIcon}>{catMeta.icon}</Text>
              <View style={styles.txMid}>
                <Text style={styles.txDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                <Text style={styles.txMeta}>
                  {dateStr}
                  {tx.category ? ` · ${displayTxCategoryLabel(tx, language, t)}` : ''}
                </Text>
              </View>
              <Text style={[styles.txAmount, amt < 0 ? styles.negative : styles.positive]}>
                {amt > 0 ? '+' : amt < 0 ? '−' : ''}{txSym}{Math.abs(amt).toFixed(2)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>

    <AddTransactionModal
      visible={showAddModal}
      onClose={() => setShowAddModal(false)}
      accounts={accounts}
      allRates={allRates}
      allRatesList={allRatesList}
      onSuccess={fetchAll}
    />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F6F6' },
  content: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F6F6F6' },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: '#888', marginTop: 4 },
  addBtn: { backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  widget: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  widgetTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  viewAll: { fontSize: 13, fontWeight: '600', color: BRAND },

  balanceHero: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  balanceLabel: { fontSize: 12, color: '#888', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  balanceAmount: { fontSize: 32, fontWeight: '800', color: BRAND, letterSpacing: -1, marginTop: 4 },
  balanceCurrency: { fontSize: 13, color: '#aaa', fontWeight: '600', marginTop: 2 },

  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  accountIcon: { fontSize: 22 },
  accountMid: { flex: 1 },
  accountName: { fontSize: 14, fontWeight: '600', color: '#333' },
  accountMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
  accountBal: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },

  periodLabel: { fontSize: 13, color: '#888', marginBottom: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: '#f0f0f0' },
  statLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  statValue: { fontSize: 14, fontWeight: '800' },
  positive: { color: '#27ae60' },
  negative: { color: '#c0392b' },

  topCatRow: {
    backgroundColor: '#f9f9f9', borderRadius: 12, padding: 12, marginBottom: 12,
  },
  topCatLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  topCatValue: { fontSize: 14, fontWeight: '600', color: '#333' },

  chartTitle: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 8 },
  txCountHint: { fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 8 },

  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  txIcon: { fontSize: 20 },
  txMid: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '600', color: '#333' },
  txMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },

  emptyHint: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 16 },

  budgetRow: { marginBottom: 10 },
  budgetRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  budgetRowIcon: { fontSize: 16 },
  budgetRowName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },
  budgetRowAmount: { fontSize: 12, fontWeight: '700', color: '#666' },
  budgetTrack: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  budgetBar: { height: '100%', borderRadius: 3 },
  budgetOverHint: { fontSize: 11, color: '#c0392b', fontWeight: '600', textAlign: 'center', marginTop: 4 },
});
