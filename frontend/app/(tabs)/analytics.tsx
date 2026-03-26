import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import type { Transaction, Account } from '@/types';
import { BRAND, CATEGORY_COLORS, currencySymbol } from '@/constants/brand';

type Period = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';
type MainTab = 'spendings' | 'income';
type RangeMode = 'weekly' | 'monthly' | 'annually' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d',  label: '7D' },
  { key: '30d', label: '30D' },
  { key: '3m',  label: '3M' },
  { key: '6m',  label: '6M' },
  { key: '1y',  label: '1Y' },
  { key: 'all', label: 'All' },
];

// RANGE_MODE_LABELS replaced by t() calls per mode key

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

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, color, sym }: { data: { label: string; value: number }[]; color: string; sym: string }) {
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
  root: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 8, fontWeight: '700', marginBottom: 2, textAlign: 'center' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  bar: { borderRadius: 4, minHeight: 2 },
  barLabel: { fontSize: 9, color: '#aaa', marginTop: 4, textAlign: 'center' },
});

// ── Category Pie Chart ─────────────────────────────────────────────────────────
type Slice = { label: string; value: number; color: string; pct: number };

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({ slices, size, accentColor, total, sym, selected, onPress }: {
  slices: Slice[]; size: number; accentColor: string; total: number; sym: string;
  selected: Slice | null; onPress: (s: Slice) => void;
}) {
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0);
  const cx = size / 2, cy = size / 2;
  const R = size / 2 - 4;
  const r = R * 0.56;
  const GAP = 1.2;

  let cursor = 0;
  const active = selected;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {slices.map((s, i) => {
          const sweep = (s.pct / 100) * 360;
          const start = cursor + GAP / 2;
          const end = cursor + sweep - GAP / 2;
          cursor += sweep;

          const isActive = active?.label === s.label;
          const outerR = isActive ? R + 5 : R;
          const innerR = isActive ? r - 2 : r;

          if (sweep >= 359.5) {
            return (
              <Circle
                key={i} cx={cx} cy={cy}
                r={(outerR + innerR) / 2}
                stroke={s.color} strokeWidth={outerR - innerR} fill="none"
                onPress={() => onPress(s)}
              />
            );
          }

          const o1 = polar(cx, cy, outerR, start);
          const o2 = polar(cx, cy, outerR, end);
          const i1 = polar(cx, cy, innerR, end);
          const i2 = polar(cx, cy, innerR, start);
          const large = sweep - GAP > 180 ? 1 : 0;

          const d = [
            `M ${o1.x} ${o1.y}`,
            `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
            `L ${i1.x} ${i1.y}`,
            `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}`,
            'Z',
          ].join(' ');

          return <Path key={i} d={d} fill={s.color} opacity={active && !isActive ? 0.35 : 1} onPress={() => onPress(s)} />;
        })}
      </Svg>

      {/* Center label */}
      <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
        {active ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '800', color: active.color, letterSpacing: -0.3 }} numberOfLines={1}>
              {sym}{fmt(active.value)}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: active.color, marginTop: 1 }}>
              {active.pct.toFixed(1)}%
            </Text>
            <Text style={{ fontSize: 9, color: '#aaa', fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
              {active.label}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 15, fontWeight: '800', color: accentColor, letterSpacing: -0.5 }}>
              {sym}{fmt(total)}
            </Text>
            <Text style={{ fontSize: 9, color: '#bbb', fontWeight: '700', letterSpacing: 0.5, marginTop: 1 }}>
              TOTAL
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function CategoryPieChart({ slices, total, sym, accentColor }: {
  slices: Slice[]; total: number; sym: string; accentColor: string;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Slice | null>(null);
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0);

  const handlePress = (s: Slice) => setSelected(prev => prev?.label === s.label ? null : s);

  if (slices.length === 0 || total === 0) {
    return (
      <View style={pieStyles.empty}>
        <Text style={pieStyles.emptyText}>{t('no_data')}</Text>
      </View>
    );
  }

  return (
    <View style={pieStyles.chartRow}>
      <DonutChart
        slices={slices} size={170} accentColor={accentColor}
        total={total} sym={sym} selected={selected} onPress={handlePress}
      />
    </View>
  );
}

const pieStyles = StyleSheet.create({
  chartRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  legend:     { flex: 1, gap: 9 },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  legendLabel:{ flex: 1, fontSize: 12, color: '#333', fontWeight: '500' },
  legendValue:{ fontSize: 12, fontWeight: '700' },
  legendPct:  { fontSize: 11, color: '#aaa', width: 38, textAlign: 'right' },
  moreText:   { fontSize: 11, color: '#bbb', marginTop: 2 },
  empty:      { alignItems: 'center', paddingVertical: 24 },
  emptyText:  { color: '#bbb', fontSize: 13 },
});

// ── Stat row ──────────────────────────────────────────────────────────────────
function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={statStyles.row}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  label: { fontSize: 14, color: '#666' },
  value: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
});

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('30d');
  const [mainTab, setMainTab] = useState<MainTab>('spendings');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // ── Date range navigator ──────────────────────────────────────────────────
  const [rangeMode, setRangeMode] = useState<RangeMode>('monthly');
  const [navDate, setNavDate] = useState(() => new Date());
  const [showModeMenu, setShowModeMenu] = useState(false);

  const navigate = useCallback((dir: -1 | 1) => {
    setNavDate(prev => {
      const d = new Date(prev);
      if (rangeMode === 'weekly')   d.setDate(d.getDate() + dir * 7);
      if (rangeMode === 'monthly')  d.setMonth(d.getMonth() + dir);
      if (rangeMode === 'annually') d.setFullYear(d.getFullYear() + dir);
      return d;
    });
  }, [rangeMode]);

  const rangeLabel = useMemo(() => {
    if (rangeMode === 'custom') return t('custom');
    if (rangeMode === 'weekly') {
      const day = navDate.getDay();
      const mon = new Date(navDate);
      mon.setDate(navDate.getDate() - (day === 0 ? 6 : day - 1));
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `${fmt(mon)} – ${fmt(sun)}`;
    }
    if (rangeMode === 'monthly') {
      return navDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    return `${navDate.getFullYear()}`;
  }, [rangeMode, navDate]);

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

  // ── Filtered transactions for the selected period ─────────────────────────
  const filtered = useMemo(() => {
    if (rangeMode === 'custom') return filterByPeriod(transactions, period);
    if (rangeMode === 'monthly') {
      const y = navDate.getFullYear(), m = navDate.getMonth();
      return transactions.filter(tx => {
        const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
        return d.getFullYear() === y && d.getMonth() === m;
      });
    }
    if (rangeMode === 'annually') {
      const y = navDate.getFullYear();
      return transactions.filter(tx => {
        const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
        return d.getFullYear() === y;
      });
    }
    if (rangeMode === 'weekly') {
      const day = navDate.getDay();
      const mon = new Date(navDate);
      mon.setDate(navDate.getDate() - (day === 0 ? 6 : day - 1));
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 7);
      return transactions.filter(tx => {
        const t = tx.time < 1e10 ? tx.time * 1000 : tx.time;
        return t >= mon.getTime() && t < sun.getTime();
      });
    }
    return transactions;
  }, [transactions, rangeMode, navDate, period]);

  const isInternal = (tx: Transaction) => tx.category === 'Transfer' || tx.category === 'Correction';
  const expenses  = useMemo(() => filtered.filter(tx => tx.amount < 0 && !isInternal(tx)), [filtered]);
  const income    = useMemo(() => filtered.filter(tx => tx.amount > 0 && !isInternal(tx)), [filtered]);

  const totalExpenses = expenses.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalIncome   = income.reduce((s, tx) => s + tx.amount, 0);

  // ── Spending category slices ───────────────────────────────────────────────
  const categorySlices = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(tx => {
      const key = tx.category ?? 'Other';
      map[key] = (map[key] ?? 0) + Math.abs(tx.amount);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: getCatColor(label, i), pct: (value / total) * 100 }));
  }, [expenses]);

  // ── Income category slices ─────────────────────────────────────────────────
  const incomeSlices = useMemo(() => {
    const map: Record<string, number> = {};
    income.forEach(tx => {
      const key = tx.category ?? 'Other';
      map[key] = (map[key] ?? 0) + tx.amount;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: getCatColor(label, i), pct: (value / total) * 100 }));
  }, [income]);

  // ── Monthly trend (last 6 months, always from all transactions) ───────────
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
      if (tx.amount < 0 && tx.source !== 'transfer') months[key].exp += Math.abs(tx.amount);
      if (tx.amount > 0 && tx.source !== 'transfer') months[key].inc += tx.amount;
    });
    return Object.entries(months).map(([key, val]) => ({
      label: new Date(key + '-01').toLocaleDateString('en-GB', { month: 'short' }),
      exp: val.exp, inc: val.inc,
    }));
  }, [transactions]);

  // ── Category-drilled transactions ─────────────────────────────────────────
  const catDrilledTxs = useMemo(() => {
    if (!selectedCategory) return [];
    const pool = mainTab === 'spendings' ? expenses : income;
    return pool.filter(tx => (tx.category ?? 'Other') === selectedCategory);
  }, [selectedCategory, expenses, income, mainTab]);

  const sym = currencySymbol(980);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>;

  const activeSlices = mainTab === 'spendings' ? categorySlices : incomeSlices;
  const activeTotal  = mainTab === 'spendings' ? totalExpenses : totalIncome;
  const accentColor  = mainTab === 'spendings' ? '#c0392b' : '#27ae60';

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
        <Text style={styles.headerSub}>{filtered.length} transactions in period</Text>
      </View>

      {/* ── Date Range Navigator ── */}
      <View style={styles.rangeRow}>
        {rangeMode !== 'custom' ? (
          <TouchableOpacity onPress={() => navigate(-1)} style={styles.navArrow}>
            <Text style={styles.navArrowText}>‹</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.navArrowPlaceholder} />
        )}

        {rangeMode !== 'custom' ? (
          <Text style={styles.rangeLabel} numberOfLines={1}>{rangeLabel}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodContainer} style={{ flex: 1 }}>
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
        )}

        {rangeMode !== 'custom' ? (
          <TouchableOpacity onPress={() => navigate(1)} style={styles.navArrow}>
            <Text style={styles.navArrowText}>›</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.navArrowPlaceholder} />
        )}

        <TouchableOpacity onPress={() => setShowModeMenu(true)} style={styles.modeButton}>
          <Text style={styles.modeButtonText}>{t(rangeMode)} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* ── Mode dropdown modal ── */}
      <Modal visible={showModeMenu} transparent animationType="fade" onRequestClose={() => setShowModeMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowModeMenu(false)} activeOpacity={1}>
          <View style={styles.modeMenu}>
            {(['weekly', 'monthly', 'annually', 'custom'] as RangeMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.modeMenuItem, rangeMode === mode && styles.modeMenuItemActive]}
                onPress={() => { setRangeMode(mode); setShowModeMenu(false); }}
              >
                <Text style={[styles.modeMenuItemText, rangeMode === mode && styles.modeMenuItemTextActive]}>
                  {t(mode)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Main Tabs: Spendings / Income ── */}
      <View style={styles.mainTabs}>
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'spendings' && styles.mainTabActiveSpend]}
          onPress={() => { setMainTab('spendings'); setSelectedCategory(null); }}
        >
          <Text style={[styles.mainTabText, mainTab === 'spendings' && styles.mainTabTextActiveSpend]}>
            ⬆️  {t('spendings')}
          </Text>
          <Text style={[styles.mainTabAmount, { color: mainTab === 'spendings' ? '#c0392b' : '#aaa' }]}>
            {sym}{totalExpenses.toFixed(0)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'income' && styles.mainTabActiveIncome]}
          onPress={() => { setMainTab('income'); setSelectedCategory(null); }}
        >
          <Text style={[styles.mainTabText, mainTab === 'income' && styles.mainTabTextActiveIncome]}>
            ⬇️  {t('income')}
          </Text>
          <Text style={[styles.mainTabAmount, { color: mainTab === 'income' ? '#27ae60' : '#aaa' }]}>
            {sym}{totalIncome.toFixed(0)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ════════════════════════════════════════════════════════════════
          SPENDINGS TAB
      ════════════════════════════════════════════════════════════════ */}
      {mainTab === 'spendings' && (
        <>
          {/* Summary stats */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <StatRow label={t('total_spent')}       value={`${sym}${totalExpenses.toFixed(2)}`}  color="#c0392b" />
            <StatRow label="Transactions"      value={`${expenses.length}`} />
            <StatRow label={t('average_expense')}   value={expenses.length > 0 ? `${sym}${(totalExpenses / expenses.length).toFixed(2)}` : '—'} />
            <StatRow label={t('largest_expense')}   value={expenses.length > 0 ? `${sym}${Math.max(...expenses.map(tx => Math.abs(tx.amount))).toFixed(2)}` : '—'} color="#e67e22" />
            <View style={[statStyles.row, { borderBottomWidth: 0 }]}>
              <Text style={statStyles.label}>Top Category</Text>
              <Text style={[statStyles.value, { color: categorySlices[0] ? getCatColor(categorySlices[0].label, 0) : '#aaa' }]}>
                {categorySlices[0]?.label ?? '—'}
              </Text>
            </View>
          </View>

          {/* Category pie */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('by_category')}</Text>
            <CategoryPieChart slices={categorySlices} total={totalExpenses} sym={sym} accentColor="#c0392b" />
          </View>

          {/* Category breakdown */}
          {categorySlices.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Category Breakdown</Text>
              {categorySlices.map((cat, i) => [
                <TouchableOpacity
                  key={`cat-${i}`}
                  style={styles.catRow}
                  onPress={() => setSelectedCategory(selectedCategory === cat.label ? null : cat.label)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
                  <Text style={styles.catPct}>{cat.pct.toFixed(1)}%</Text>
                  <Text style={[styles.catAmount, { color: cat.color }]}>{sym}{cat.value.toFixed(0)}</Text>
                  <Text style={styles.catArrow}>{selectedCategory === cat.label ? '▲' : '▼'}</Text>
                </TouchableOpacity>,

                selectedCategory === cat.label && catDrilledTxs.length > 0 && (
                  <View key={`drill-${i}`} style={styles.drillBox}>
                    {catDrilledTxs.slice(0, 8).map((tx, idx) => (
                      <TouchableOpacity key={tx.id} style={[styles.drillRow, idx < Math.min(catDrilledTxs.length, 8) - 1 && styles.drillBorder]} onPress={() => router.push(`/transaction/${tx.id}` as any)} activeOpacity={0.7}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.drillDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                          <Text style={styles.drillDate}>
                            {new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
                        <Text style={styles.drillAmount}>{sym}{Math.abs(tx.amount).toFixed(2)}</Text>
                      </TouchableOpacity>
                    ))}
                    {catDrilledTxs.length > 8 && (
                      <Text style={styles.drillMore}>+{catDrilledTxs.length - 8} more</Text>
                    )}
                  </View>
                ),
              ])}
            </View>
          )}

          {/* Top expenses */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('top_expenses')}</Text>
            {expenses.length === 0 ? (
              <Text style={styles.emptyCard}>No expenses in this period</Text>
            ) : [...expenses].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5).map((tx, i, arr) => (
              <TouchableOpacity key={tx.id} style={[styles.topRow, i < arr.length - 1 && styles.topBorder]} onPress={() => router.push(`/transaction/${tx.id}` as any)} activeOpacity={0.7}>
                <Text style={styles.topRank}>#{i + 1}</Text>
                <View style={styles.topMid}>
                  <Text style={styles.topDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                  <Text style={styles.topMeta}>{tx.category ?? tx.source}</Text>
                </View>
                <Text style={[styles.topAmount, { color: '#c0392b' }]}>{sym}{Math.abs(tx.amount).toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 6-month spending trend */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('trend_6_months')}</Text>
            <BarChart data={monthlyTrend.map(m => ({ label: m.label, value: m.exp }))} color="#c0392b" sym={sym} />
          </View>

          {/* Spending habits by weekday */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('by_weekday')}</Text>
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
                        <View style={[styles.weekdayBar, { height: `${(byWeekday[i] / maxDay) * 100}%`, backgroundColor: '#c0392b' + 'cc' }]} />
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          INCOME TAB
      ════════════════════════════════════════════════════════════════ */}
      {mainTab === 'income' && (
        <>
          {/* Summary stats */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <StatRow label={t('total_income')}      value={`${sym}${totalIncome.toFixed(2)}`}  color="#27ae60" />
            <StatRow label="Transactions"      value={`${income.length}`} />
            <StatRow label={t('average_income')}    value={income.length > 0 ? `${sym}${(totalIncome / income.length).toFixed(2)}` : '—'} />
            <StatRow label={t('largest_income')}    value={income.length > 0 ? `${sym}${Math.max(...income.map(tx => tx.amount)).toFixed(2)}` : '—'} color="#27ae60" />
            <View style={[statStyles.row, { borderBottomWidth: 0 }]}>
              <Text style={statStyles.label}>Top Source</Text>
              <Text style={[statStyles.value, { color: incomeSlices[0] ? getCatColor(incomeSlices[0].label, 0) : '#aaa' }]}>
                {incomeSlices[0]?.label ?? '—'}
              </Text>
            </View>
          </View>

          {/* Category pie */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>By Source / Category</Text>
            <CategoryPieChart slices={incomeSlices} total={totalIncome} sym={sym} accentColor="#27ae60" />
          </View>

          {/* Category breakdown */}
          {incomeSlices.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Category Breakdown</Text>
              {incomeSlices.map((cat, i) => [
                <TouchableOpacity
                  key={`cat-${i}`}
                  style={styles.catRow}
                  onPress={() => setSelectedCategory(selectedCategory === cat.label ? null : cat.label)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
                  <Text style={styles.catPct}>{cat.pct.toFixed(1)}%</Text>
                  <Text style={[styles.catAmount, { color: cat.color }]}>{sym}{cat.value.toFixed(0)}</Text>
                  <Text style={styles.catArrow}>{selectedCategory === cat.label ? '▲' : '▼'}</Text>
                </TouchableOpacity>,

                selectedCategory === cat.label && catDrilledTxs.length > 0 && (
                  <View key={`drill-${i}`} style={styles.drillBox}>
                    {catDrilledTxs.slice(0, 8).map((tx, idx) => (
                      <TouchableOpacity key={tx.id} style={[styles.drillRow, idx < Math.min(catDrilledTxs.length, 8) - 1 && styles.drillBorder]} onPress={() => router.push(`/transaction/${tx.id}` as any)} activeOpacity={0.7}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.drillDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                          <Text style={styles.drillDate}>
                            {new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
                        <Text style={[styles.drillAmount, { color: '#27ae60' }]}>+{sym}{tx.amount.toFixed(2)}</Text>
                      </TouchableOpacity>
                    ))}
                    {catDrilledTxs.length > 8 && (
                      <Text style={styles.drillMore}>+{catDrilledTxs.length - 8} more</Text>
                    )}
                  </View>
                ),
              ])}
            </View>
          )}

          {/* Top income transactions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('top_income')}</Text>
            {income.length === 0 ? (
              <Text style={styles.emptyCard}>No income in this period</Text>
            ) : [...income].sort((a, b) => b.amount - a.amount).slice(0, 5).map((tx, i, arr) => (
              <TouchableOpacity key={tx.id} style={[styles.topRow, i < arr.length - 1 && styles.topBorder]} onPress={() => router.push(`/transaction/${tx.id}` as any)} activeOpacity={0.7}>
                <Text style={styles.topRank}>#{i + 1}</Text>
                <View style={styles.topMid}>
                  <Text style={styles.topDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                  <Text style={styles.topMeta}>{tx.category ?? tx.source}</Text>
                </View>
                <Text style={[styles.topAmount, { color: '#27ae60' }]}>+{sym}{tx.amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 6-month income trend */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('trend_6_months')}</Text>
            <BarChart data={monthlyTrend.map(m => ({ label: m.label, value: m.inc }))} color="#27ae60" sym={sym} />
          </View>

          {/* Income by weekday */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('by_weekday')}</Text>
            {(() => {
              const byWeekday = Array(7).fill(0);
              const byWeekdayCount = Array(7).fill(0);
              income.forEach(tx => {
                const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
                byWeekday[d.getDay()] += tx.amount;
                byWeekdayCount[d.getDay()]++;
              });
              const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              const maxDay = Math.max(...byWeekday, 1);
              return (
                <View style={styles.weekdayRow}>
                  {days.map((d, i) => (
                    <View key={i} style={styles.weekdayCol}>
                      <View style={styles.weekdayTrack}>
                        <View style={[styles.weekdayBar, { height: `${(byWeekday[i] / maxDay) * 100}%`, backgroundColor: '#27ae60cc' }]} />
                      </View>
                      <Text style={styles.weekdayLabel}>{d}</Text>
                      <Text style={styles.weekdayCount}>{byWeekdayCount[i]}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
            <Text style={styles.habitNote}>Height = total received · Number = transaction count</Text>
          </View>
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

  // Range navigator
  rangeRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 6, paddingRight: 10,
  },
  navArrow: { padding: 10 },
  navArrowText: { fontSize: 26, color: BRAND, fontWeight: '300', lineHeight: 28 },
  navArrowPlaceholder: { width: 44 },
  rangeLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  modeButton: { backgroundColor: '#f0f0f0', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 },
  modeButtonText: { fontSize: 12, fontWeight: '700', color: '#555' },

  // Mode dropdown
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 160, paddingRight: 16 },
  modeMenu: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', minWidth: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  modeMenuItem: { paddingVertical: 13, paddingHorizontal: 18 },
  modeMenuItemActive: { backgroundColor: BRAND + '15' },
  modeMenuItemText: { fontSize: 14, fontWeight: '600', color: '#333' },
  modeMenuItemTextActive: { color: BRAND, fontWeight: '800' },

  // Period chips
  periodContainer: { paddingHorizontal: 8, paddingVertical: 6, gap: 8, alignItems: 'center' },
  periodChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0' },
  periodChipActive: { backgroundColor: BRAND },
  periodChipText: { fontSize: 12, fontWeight: '700', color: '#888' },
  periodChipTextActive: { color: '#fff' },

  // Main tabs
  mainTabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 16,
  },
  mainTab: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  mainTabActiveSpend:  { borderBottomColor: '#c0392b' },
  mainTabActiveIncome: { borderBottomColor: '#27ae60' },
  mainTabText: { fontSize: 14, fontWeight: '700', color: '#aaa' },
  mainTabTextActiveSpend:  { color: '#c0392b' },
  mainTabTextActiveIncome: { color: '#27ae60' },
  mainTabAmount: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, marginBottom: 14,
    padding: 18, borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 14 },
  emptyCard: { fontSize: 14, color: '#bbb', textAlign: 'center', paddingVertical: 12 },

  // Category rows inside breakdown card
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  catDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  catLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  catPct: { fontSize: 12, color: '#aaa', width: 38, textAlign: 'right' },
  catAmount: { fontSize: 14, fontWeight: '700', width: 64, textAlign: 'right' },
  catArrow: { fontSize: 10, color: '#ccc', width: 14, textAlign: 'center' },

  // Drill-down box
  drillBox: { backgroundColor: '#fafafa', borderRadius: 12, padding: 12, marginBottom: 4 },
  drillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  drillBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  drillDesc: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  drillDate: { fontSize: 11, color: '#aaa', marginTop: 1 },
  drillAmount: { fontSize: 13, fontWeight: '700', color: '#c0392b' },
  drillMore: { textAlign: 'center', color: '#bbb', fontSize: 12, paddingTop: 8 },

  // Top list
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  topBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  topRank: { fontSize: 12, fontWeight: '700', color: '#ccc', width: 24 },
  topMid: { flex: 1 },
  topDesc: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  topMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
  topAmount: { fontSize: 14, fontWeight: '700' },

  // Weekday chart
  weekdayRow: { flexDirection: 'row', gap: 6, height: 90, alignItems: 'flex-end' },
  weekdayCol: { flex: 1, alignItems: 'center' },
  weekdayTrack: { flex: 1, width: '80%', backgroundColor: '#f0f0f0', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  weekdayBar: { borderRadius: 4, minHeight: 2 },
  weekdayLabel: { fontSize: 9, color: '#aaa', marginTop: 4 },
  weekdayCount: { fontSize: 10, fontWeight: '700', color: '#888' },
  habitNote: { fontSize: 10, color: '#ccc', textAlign: 'center', marginTop: 10 },
});
