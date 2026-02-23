import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_CHART_WIDTH = SCREEN_WIDTH - 64;

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
  category?: string | null;
}

interface Account {
  id: number;
  name: string;
  currency_code: number;
  balance?: number;
}

type Period = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';
type ViewTab = 'overview' | 'categories' | 'trends' | 'accounts';

// ── Constants ─────────────────────────────────────────────────────────────────
const BRAND = '#8B1A1A';
const CURRENCY_SYMBOLS: Record<number, string> = { 980: '₴', 840: '$', 978: '€', 826: '£' };
const currencySymbol = (code: number) => CURRENCY_SYMBOLS[code] ?? '?';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d',  label: '7D' },
  { key: '30d', label: '30D' },
  { key: '3m',  label: '3M' },
  { key: '6m',  label: '6M' },
  { key: '1y',  label: '1Y' },
  { key: 'all', label: 'All' },
];

const VIEW_TABS: { key: ViewTab; label: string; icon: string }[] = [
  { key: 'overview',   label: 'Overview',   icon: '📊' },
  { key: 'categories', label: 'Categories', icon: '🏷️' },
  { key: 'trends',     label: 'Trends',     icon: '📈' },
  { key: 'accounts',   label: 'Accounts',   icon: '🏦' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink':  '#e67e22',
  'Groceries':     '#27ae60',
  'Transport':     '#2980b9',
  'Health':        '#e91e63',
  'Shopping':      '#9b59b6',
  'Entertainment': '#f39c12',
  'Housing':       '#16a085',
  'Salary':        '#2ecc71',
  'Transfer':      '#95a5a6',
  'Other':         '#7f8c8d',
};

const PALETTE = [
  '#8B1A1A','#e67e22','#27ae60','#2980b9','#9b59b6',
  '#f39c12','#16a085','#e91e63','#1abc9c','#d35400',
];

function getCatColor(cat: string | null | undefined, idx: number): string {
  if (cat && CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  return PALETTE[idx % PALETTE.length];
}

// ── Period filter ─────────────────────────────────────────────────────────────
function filterByPeriod(txs: Transaction[], period: Period): Transaction[] {
  if (period === 'all') return txs;
  const now = Date.now();
  const ms: Record<Period, number> = {
    '7d':  7  * 86400000,
    '30d': 30 * 86400000,
    '3m':  90 * 86400000,
    '6m':  180* 86400000,
    '1y':  365* 86400000,
    'all': 0,
  };
  const cutoff = now - ms[period];
  return txs.filter(tx => {
    const t = tx.time < 1e10 ? tx.time * 1000 : tx.time;
    return t >= cutoff;
  });
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  return (
    <View style={chartStyles.root}>
      {data.map((d, i) => (
        <View key={i} style={chartStyles.barCol}>
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
  root: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  bar: { borderRadius: 4, minHeight: 2 },
  barLabel: { fontSize: 9, color: '#aaa', marginTop: 4, textAlign: 'center' },
});

// ── Donut chart (pure RN) ─────────────────────────────────────────────────────
function DonutLegend({ slices }: { slices: { label: string; value: number; color: string; pct: number }[] }) {
  return (
    <View style={donutStyles.legend}>
      {slices.slice(0, 8).map((s, i) => (
        <View key={i} style={donutStyles.legendRow}>
          <View style={[donutStyles.dot, { backgroundColor: s.color }]} />
          <Text style={donutStyles.legendLabel} numberOfLines={1}>{s.label}</Text>
          <Text style={donutStyles.legendPct}>{s.pct.toFixed(1)}%</Text>
          <Text style={donutStyles.legendValue}>{s.value.toFixed(0)}</Text>
        </View>
      ))}
    </View>
  );
}

const donutStyles = StyleSheet.create({
  legend: { gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: '#333', fontWeight: '500' },
  legendPct: { fontSize: 12, color: '#888', width: 42, textAlign: 'right' },
  legendValue: { fontSize: 12, fontWeight: '700', color: '#1a1a1a', width: 64, textAlign: 'right' },
});

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: string }) {
  return (
    <View style={[statStyles.card, { borderLeftColor: color }]}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      {sub && <Text style={statStyles.sub}>{sub}</Text>}
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderLeftWidth: 3, minWidth: 140,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  icon: { fontSize: 22, marginBottom: 6 },
  label: { fontSize: 11, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 11, color: '#bbb', marginTop: 3 },
});

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const { language } = useAppSettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('30d');
  const [viewTab, setViewTab] = useState<ViewTab>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);

  const expenses   = useMemo(() => filtered.filter(tx => tx.amount < 0 && tx.source !== 'transfer'), [filtered]);
  const income     = useMemo(() => filtered.filter(tx => tx.amount > 0 && tx.source !== 'transfer'), [filtered]);
  const transfers  = useMemo(() => filtered.filter(tx => tx.category === 'Transfer'), [filtered]);

  const totalExpenses  = expenses.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalIncome    = income.reduce((s, tx) => s + tx.amount, 0);
  const totalTransfers = transfers.reduce((s, tx) => s + Math.abs(tx.amount), 0) / 2;
  const netFlow        = totalIncome - totalExpenses;
  const savingsRate    = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
  const avgExpensePerTx = expenses.length > 0 ? totalExpenses / expenses.length : 0;
  const largestExpense  = expenses.length > 0 ? Math.max(...expenses.map(tx => Math.abs(tx.amount))) : 0;

  // ── Category breakdown ────────────────────────────────────────────────────
  const categoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(tx => {
      const key = tx.category ?? 'Other';
      map[key] = (map[key] ?? 0) + Math.abs(tx.amount);
    });
    return map;
  }, [expenses]);

  const categorySlices = useMemo(() => {
    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label, value, color: getCatColor(label, i),
        pct: (value / total) * 100,
      }));
  }, [categoryMap]);

  // ── Monthly trend (last 6 months) ─────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { exp: number; inc: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { exp: 0, inc: 0 };
    }
    transactions.forEach(tx => {
      const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key] === undefined) return;
      if (tx.amount < 0 && tx.category !== 'Transfer') months[key].exp += Math.abs(tx.amount);
      if (tx.amount > 0 && tx.category !== 'Transfer') months[key].inc += tx.amount;
    });
    return Object.entries(months).map(([key, val]) => ({
      label: new Date(key + '-01').toLocaleDateString('en-GB', { month: 'short' }),
      exp: val.exp, inc: val.inc,
    }));
  }, [transactions]);

  // ── Daily spending (last 30 days) ─────────────────────────────────────────
  const dailySpending = useMemo(() => {
    const days: Record<string, number> = {};
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      days[d.toISOString().split('T')[0]] = 0;
    }
    expenses.forEach(tx => {
      const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
      const key = d.toISOString().split('T')[0];
      if (days[key] !== undefined) days[key] += Math.abs(tx.amount);
    });
    return Object.entries(days).map(([key, value]) => ({
      label: new Date(key).toLocaleDateString('en-GB', { day: 'numeric' }),
      value,
    }));
  }, [expenses]);

  // ── Account breakdown ─────────────────────────────────────────────────────
  const accountBreakdown = useMemo(() => {
    return accounts.map(acc => {
      const accTxs = filtered.filter(tx => tx.account_id === acc.id);
      const spent = accTxs.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
      const received = accTxs.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);
      return { ...acc, spent, received, txCount: accTxs.length };
    }).sort((a, b) => b.txCount - a.txCount);
  }, [accounts, filtered]);

  // ── Top spending transactions ──────────────────────────────────────────────
  const topExpenses = useMemo(() =>
    [...expenses].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5),
  [expenses]);

  // ── Category-filtered transactions ────────────────────────────────────────
  const catFiltered = useMemo(() =>
    selectedCategory ? filtered.filter(tx => (tx.category ?? 'Other') === selectedCategory) : [],
  [filtered, selectedCategory]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>;

  const sym = currencySymbol(980); // default display currency

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={BRAND} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Text style={styles.headerSub}>{filtered.length} transactions</Text>
      </View>

      {/* ── Period Filter ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={styles.periodContainer}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodChip, period === p.key && styles.periodChipActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodChipText, period === p.key && styles.periodChipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── View Tabs ── */}
      <View style={styles.viewTabs}>
        {VIEW_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.viewTab, viewTab === tab.key && styles.viewTabActive]}
            onPress={() => setViewTab(tab.key)}
          >
            <Text style={styles.viewTabIcon}>{tab.icon}</Text>
            <Text style={[styles.viewTabLabel, viewTab === tab.key && styles.viewTabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ════════════════════════════════════════════════════════════════
          OVERVIEW TAB
      ════════════════════════════════════════════════════════════════ */}
      {viewTab === 'overview' && (
        <>
          {/* Key stats */}
          <Text style={styles.sectionTitle}>Summary</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statScroll} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            <StatCard label="Total Spent"    value={`${sym}${totalExpenses.toFixed(0)}`}   color="#c0392b"  icon="⬆️" sub={`${expenses.length} transactions`} />
            <StatCard label="Total Income"   value={`${sym}${totalIncome.toFixed(0)}`}    color="#27ae60"  icon="⬇️" sub={`${income.length} transactions`} />
            <StatCard label="Net Flow"       value={`${netFlow >= 0 ? '+' : ''}${sym}${netFlow.toFixed(0)}`} color={netFlow >= 0 ? '#27ae60' : '#c0392b'} icon="↕️" />
            <StatCard label="Savings Rate"   value={`${savingsRate.toFixed(1)}%`}          color="#2980b9"  icon="💰" />
            <StatCard label="Avg Expense"    value={`${sym}${avgExpensePerTx.toFixed(0)}`} color="#9b59b6"  icon="📊" />
            <StatCard label="Largest Spend"  value={`${sym}${largestExpense.toFixed(0)}`}  color="#e67e22"  icon="🔺" />
            <StatCard label="Transfers"      value={`${sym}${totalTransfers.toFixed(0)}`}  color="#7f8c8d"  icon="↔️" sub={`${transfers.length / 2 | 0} transfers`} />
          </ScrollView>

          {/* Net flow bar */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Income vs Expenses</Text>
            <View style={styles.flowBar}>
              {totalIncome + totalExpenses > 0 && (
                <>
                  <View style={[styles.flowSegment, { flex: totalIncome, backgroundColor: '#27ae60' }]} />
                  <View style={[styles.flowSegment, { flex: totalExpenses, backgroundColor: '#c0392b' }]} />
                </>
              )}
            </View>
            <View style={styles.flowLegend}>
              <View style={styles.flowLegendItem}>
                <View style={[styles.flowDot, { backgroundColor: '#27ae60' }]} />
                <Text style={styles.flowLegendText}>Income {sym}{totalIncome.toFixed(0)}</Text>
              </View>
              <View style={styles.flowLegendItem}>
                <View style={[styles.flowDot, { backgroundColor: '#c0392b' }]} />
                <Text style={styles.flowLegendText}>Expenses {sym}{totalExpenses.toFixed(0)}</Text>
              </View>
            </View>
          </View>

          {/* Daily spending chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Spending (14 days)</Text>
            <BarChart data={dailySpending} color={BRAND} />
          </View>

          {/* Top expenses */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Expenses</Text>
            {topExpenses.length === 0 ? (
              <Text style={styles.emptyCard}>No expenses in this period</Text>
            ) : topExpenses.map((tx, i) => (
              <View key={tx.id} style={[styles.topRow, i < topExpenses.length - 1 && styles.topBorder]}>
                <Text style={styles.topRank}>#{i + 1}</Text>
                <View style={styles.topMid}>
                  <Text style={styles.topDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                  <Text style={styles.topMeta}>{tx.category ?? tx.source}</Text>
                </View>
                <Text style={styles.topAmount}>{sym}{Math.abs(tx.amount).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Transaction type split */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Transaction Types</Text>
            <View style={styles.typeGrid}>
              {[
                { label: 'Expenses',  count: expenses.length,  color: '#c0392b', icon: '⬆️' },
                { label: 'Income',    count: income.length,    color: '#27ae60', icon: '⬇️' },
                { label: 'Transfers', count: Math.floor(transfers.length / 2), color: '#7f8c8d', icon: '↔️' },
                { label: 'Manual',    count: filtered.filter(t => t.source === 'manual').length, color: BRAND, icon: '✏️' },
                { label: 'Monobank',  count: filtered.filter(t => t.source === 'mono').length, color: '#f39c12', icon: '🟡' },
              ].map((item, i) => (
                <View key={i} style={[styles.typeCard, { borderTopColor: item.color }]}>
                  <Text style={styles.typeIcon}>{item.icon}</Text>
                  <Text style={[styles.typeCount, { color: item.color }]}>{item.count}</Text>
                  <Text style={styles.typeLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          CATEGORIES TAB
      ════════════════════════════════════════════════════════════════ */}
      {viewTab === 'categories' && (
        <>
          <Text style={styles.sectionTitle}>Spending by Category</Text>

          {categorySlices.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptyIcon}>🏷️</Text>
              <Text style={styles.emptyText}>No categorised expenses yet</Text>
            </View>
          ) : (
            <>
              {/* Visual bar breakdown */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Category Breakdown</Text>
                <View style={styles.stackBar}>
                  {categorySlices.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.stackSegment, { flex: s.pct, backgroundColor: s.color }]}
                      onPress={() => setSelectedCategory(selectedCategory === s.label ? null : s.label)}
                    />
                  ))}
                </View>
                <DonutLegend slices={categorySlices} />
              </View>

              {/* Category cards */}
              {categorySlices.map((cat, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.catCard, selectedCategory === cat.label && { borderColor: cat.color, borderWidth: 2 }]}
                  onPress={() => setSelectedCategory(selectedCategory === cat.label ? null : cat.label)}
                  activeOpacity={0.75}
                >
                  <View style={styles.catCardLeft}>
                    <View style={[styles.catCardDot, { backgroundColor: cat.color }]} />
                    <View>
                      <Text style={styles.catCardLabel}>{cat.label}</Text>
                      <Text style={styles.catCardPct}>{cat.pct.toFixed(1)}% of expenses</Text>
                    </View>
                  </View>
                  <View style={styles.catCardRight}>
                    <Text style={[styles.catCardAmount, { color: cat.color }]}>{sym}{cat.value.toFixed(2)}</Text>
                    <Text style={styles.catCardCount}>
                      {expenses.filter(tx => (tx.category ?? 'Other') === cat.label).length} tx
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Selected category drill-down */}
              {selectedCategory && catFiltered.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.drillHeader}>
                    <Text style={styles.cardTitle}>{selectedCategory} — Transactions</Text>
                    <TouchableOpacity onPress={() => setSelectedCategory(null)}>
                      <Text style={styles.drillClose}>✕ Clear</Text>
                    </TouchableOpacity>
                  </View>
                  {catFiltered.slice(0, 10).map((tx, i) => (
                    <View key={tx.id} style={[styles.topRow, i < Math.min(catFiltered.length, 10) - 1 && styles.topBorder]}>
                      <View style={styles.topMid}>
                        <Text style={styles.topDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                        <Text style={styles.topMeta}>
                          {new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <Text style={[styles.topAmount, tx.amount < 0 ? { color: '#c0392b' } : { color: '#27ae60' }]}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  {catFiltered.length > 10 && (
                    <Text style={styles.moreText}>+{catFiltered.length - 10} more transactions</Text>
                  )}
                </View>
              )}
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TRENDS TAB
      ════════════════════════════════════════════════════════════════ */}
      {viewTab === 'trends' && (
        <>
          <Text style={styles.sectionTitle}>Monthly Trends</Text>

          {/* Monthly income chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Monthly Income</Text>
            <BarChart data={monthlyTrend.map(m => ({ label: m.label, value: m.inc }))} color="#27ae60" />
          </View>

          {/* Monthly expenses chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Monthly Expenses</Text>
            <BarChart data={monthlyTrend.map(m => ({ label: m.label, value: m.exp }))} color="#c0392b" />
          </View>

          {/* Month-by-month table */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Month Comparison</Text>
            {monthlyTrend.map((m, i) => {
              const net = m.inc - m.exp;
              return (
                <View key={i} style={[styles.trendRow, i < monthlyTrend.length - 1 && styles.topBorder]}>
                  <Text style={styles.trendMonth}>{m.label}</Text>
                  <View style={styles.trendMini}>
                    <Text style={[styles.trendInc]}>+{sym}{m.inc.toFixed(0)}</Text>
                    <Text style={[styles.trendExp]}>−{sym}{m.exp.toFixed(0)}</Text>
                  </View>
                  <Text style={[styles.trendNet, { color: net >= 0 ? '#27ae60' : '#c0392b' }]}>
                    {net >= 0 ? '+' : ''}{sym}{net.toFixed(0)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Streak / habits */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Spending Habits</Text>
            {(() => {
              const byWeekday = Array(7).fill(0);
              const byWeekdayCount = Array(7).fill(0);
              expenses.forEach(tx => {
                const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
                byWeekday[d.getDay()] += Math.abs(tx.amount);
                byWeekdayCount[d.getDay()]++;
              });
              const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              const maxDay = Math.max(...byWeekday, 1);
              return (
                <View style={styles.weekdayRow}>
                  {days.map((d, i) => (
                    <View key={i} style={styles.weekdayCol}>
                      <View style={styles.weekdayTrack}>
                        <View style={[styles.weekdayBar, { height: `${(byWeekday[i] / maxDay) * 100}%`, backgroundColor: BRAND + 'cc' }]} />
                      </View>
                      <Text style={styles.weekdayLabel}>{d}</Text>
                      <Text style={styles.weekdayCount}>{byWeekdayCount[i]}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
            <Text style={styles.habitNote}>Height = total spent · Number = transaction count</Text>
          </View>

          {/* Rolling average */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Insights</Text>
            {[
              {
                icon: '📅',
                label: 'Most active day',
                value: (() => {
                  const byDay: Record<string, number> = {};
                  filtered.forEach(tx => {
                    const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
                    const key = d.toLocaleDateString('en-GB', { weekday: 'long' });
                    byDay[key] = (byDay[key] ?? 0) + 1;
                  });
                  const top = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
                  return top ? top[0] : '—';
                })(),
              },
              {
                icon: '🏷️',
                label: 'Top category',
                value: categorySlices[0]?.label ?? '—',
              },
              {
                icon: '📉',
                label: 'Biggest month spend',
                value: `${sym}${Math.max(...monthlyTrend.map(m => m.exp), 0).toFixed(0)}`,
              },
              {
                icon: '📈',
                label: 'Biggest month income',
                value: `${sym}${Math.max(...monthlyTrend.map(m => m.inc), 0).toFixed(0)}`,
              },
              {
                icon: '🔢',
                label: 'Avg transactions/month',
                value: `${(filtered.length / Math.max(monthlyTrend.filter(m => m.exp + m.inc > 0).length, 1)).toFixed(1)}`,
              },
            ].map((item, i, arr) => (
              <View key={i} style={[styles.insightRow, i < arr.length - 1 && styles.topBorder]}>
                <Text style={styles.insightIcon}>{item.icon}</Text>
                <Text style={styles.insightLabel}>{item.label}</Text>
                <Text style={styles.insightValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          ACCOUNTS TAB
      ════════════════════════════════════════════════════════════════ */}
      {viewTab === 'accounts' && (
        <>
          <Text style={styles.sectionTitle}>Per-Account Breakdown</Text>

          {accountBreakdown.map((acc, i) => (
            <View key={acc.id} style={styles.accAnalyticsCard}>
              <View style={styles.accAnalyticsHeader}>
                <Text style={styles.accAnalyticsName}>{acc.name}</Text>
                <View style={styles.accAnalyticsBadge}>
                  <Text style={styles.accAnalyticsBadgeText}>{acc.txCount} tx</Text>
                </View>
              </View>

              <View style={styles.accStatsRow}>
                <View style={styles.accStat}>
                  <Text style={styles.accStatLabel}>Received</Text>
                  <Text style={[styles.accStatValue, { color: '#27ae60' }]}>+{sym}{acc.received.toFixed(0)}</Text>
                </View>
                <View style={styles.accStatDivider} />
                <View style={styles.accStat}>
                  <Text style={styles.accStatLabel}>Spent</Text>
                  <Text style={[styles.accStatValue, { color: '#c0392b' }]}>−{sym}{acc.spent.toFixed(0)}</Text>
                </View>
                <View style={styles.accStatDivider} />
                <View style={styles.accStat}>
                  <Text style={styles.accStatLabel}>Net</Text>
                  <Text style={[styles.accStatValue, { color: acc.received - acc.spent >= 0 ? '#27ae60' : '#c0392b' }]}>
                    {acc.received - acc.spent >= 0 ? '+' : ''}{sym}{(acc.received - acc.spent).toFixed(0)}
                  </Text>
                </View>
              </View>

              {/* Mini spend vs receive bar */}
              {(acc.received + acc.spent) > 0 && (
                <View style={styles.accFlowBar}>
                  <View style={[styles.accFlowIn,  { flex: acc.received }]} />
                  <View style={[styles.accFlowOut, { flex: acc.spent }]} />
                </View>
              )}

              {/* Categories used in this account */}
              {(() => {
                const accCats: Record<string, number> = {};
                filtered.filter(tx => tx.account_id === acc.id && tx.amount < 0).forEach(tx => {
                  const k = tx.category ?? 'Other';
                  accCats[k] = (accCats[k] ?? 0) + Math.abs(tx.amount);
                });
                const top3 = Object.entries(accCats).sort((a, b) => b[1] - a[1]).slice(0, 3);
                if (top3.length === 0) return null;
                return (
                  <View style={styles.accCatRow}>
                    {top3.map(([label, val], j) => (
                      <View key={j} style={[styles.accCatChip, { backgroundColor: getCatColor(label, j) + '22' }]}>
                        <Text style={[styles.accCatChipText, { color: getCatColor(label, j) }]}>
                          {label} · {sym}{val.toFixed(0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>
          ))}
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F6F6' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  headerSub: { fontSize: 13, color: '#aaa', marginTop: 2 },

  // Period
  periodScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  periodContainer: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  periodChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f0f0f0' },
  periodChipActive: { backgroundColor: BRAND },
  periodChipText: { fontSize: 13, fontWeight: '700', color: '#888' },
  periodChipTextActive: { color: '#fff' },

  // View tabs
  viewTabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 16 },
  viewTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  viewTabActive: { borderBottomColor: BRAND },
  viewTabIcon: { fontSize: 16, marginBottom: 2 },
  viewTabLabel: { fontSize: 10, fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.3 },
  viewTabLabelActive: { color: BRAND },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase',
    letterSpacing: 0.8, marginHorizontal: 16, marginBottom: 10, marginTop: 4,
  },

  // Stat scroll
  statScroll: { marginBottom: 16 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, marginBottom: 14,
    padding: 18, borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 14 },
  emptyCard: { fontSize: 14, color: '#bbb', textAlign: 'center', paddingVertical: 12 },

  // Flow bar
  flowBar: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 12, backgroundColor: '#f0f0f0' },
  flowSegment: { height: '100%' },
  flowLegend: { flexDirection: 'row', gap: 20 },
  flowLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flowDot: { width: 8, height: 8, borderRadius: 4 },
  flowLegendText: { fontSize: 12, color: '#666', fontWeight: '500' },

  // Top expenses
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  topBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  topRank: { fontSize: 12, fontWeight: '700', color: '#ccc', width: 24 },
  topMid: { flex: 1 },
  topDesc: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  topMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
  topAmount: { fontSize: 14, fontWeight: '700', color: '#c0392b' },

  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    flex: 1, minWidth: 80, backgroundColor: '#fafafa', borderRadius: 12,
    padding: 12, alignItems: 'center', borderTopWidth: 3,
  },
  typeIcon: { fontSize: 18, marginBottom: 4 },
  typeCount: { fontSize: 22, fontWeight: '800' },
  typeLabel: { fontSize: 10, color: '#aaa', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Categories tab
  stackBar: {
    flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden',
    marginBottom: 20, gap: 1,
  },
  stackSegment: { height: '100%', minWidth: 4 },

  catCard: {
    backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 10,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  catCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catCardDot: { width: 12, height: 12, borderRadius: 6 },
  catCardLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  catCardPct: { fontSize: 11, color: '#aaa', marginTop: 2 },
  catCardRight: { alignItems: 'flex-end' },
  catCardAmount: { fontSize: 16, fontWeight: '800' },
  catCardCount: { fontSize: 11, color: '#aaa', marginTop: 2 },

  drillHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  drillClose: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  moreText: { textAlign: 'center', color: '#bbb', fontSize: 12, paddingTop: 10 },

  emptySection: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#aaa' },

  // Trends tab
  trendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  trendMonth: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', width: 44 },
  trendMini: { flex: 1, paddingHorizontal: 8 },
  trendInc: { fontSize: 12, color: '#27ae60', fontWeight: '600' },
  trendExp: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  trendNet: { fontSize: 14, fontWeight: '800', width: 80, textAlign: 'right' },

  weekdayRow: { flexDirection: 'row', gap: 6, height: 90, alignItems: 'flex-end' },
  weekdayCol: { flex: 1, alignItems: 'center' },
  weekdayTrack: { flex: 1, width: '80%', backgroundColor: '#f0f0f0', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  weekdayBar: { borderRadius: 4, minHeight: 2 },
  weekdayLabel: { fontSize: 9, color: '#aaa', marginTop: 4 },
  weekdayCount: { fontSize: 10, fontWeight: '700', color: '#888' },
  habitNote: { fontSize: 10, color: '#ccc', textAlign: 'center', marginTop: 10 },

  insightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  insightIcon: { fontSize: 18, width: 28 },
  insightLabel: { flex: 1, fontSize: 14, color: '#555' },
  insightValue: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },

  // Accounts tab
  accAnalyticsCard: {
    backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, marginBottom: 14,
    padding: 18, borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  accAnalyticsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  accAnalyticsName: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  accAnalyticsBadge: { backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  accAnalyticsBadgeText: { fontSize: 11, fontWeight: '700', color: '#888' },
  accStatsRow: { flexDirection: 'row', marginBottom: 14 },
  accStat: { flex: 1, alignItems: 'center' },
  accStatDivider: { width: 1, backgroundColor: '#f0f0f0', marginVertical: 4 },
  accStatLabel: { fontSize: 11, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  accStatValue: { fontSize: 16, fontWeight: '800' },
  accFlowBar: { flexDirection: 'row', height: 6, borderRadius: 4, overflow: 'hidden', marginBottom: 12, gap: 2 },
  accFlowIn: { backgroundColor: '#27ae60', borderRadius: 4 },
  accFlowOut: { backgroundColor: '#c0392b', borderRadius: 4 },
  accCatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  accCatChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  accCatChipText: { fontSize: 11, fontWeight: '600' },
});