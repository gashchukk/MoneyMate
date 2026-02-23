import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Alert, RefreshControl, TouchableOpacity, StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t } from '@/components/AppContext';
import EditAccountModal from '@/components/EditAccountModal';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Account {
  id: number;
  name: string;
  type: string;
  source: string;
  currency_code: number;
  balance?: number;
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<number, string> = { 980: '₴', 840: '$', 978: '€', 826: '£' };
const currencySymbol = (code: number) => CURRENCY_SYMBOLS[code] ?? '?';

const mccColor = (mcc: number) => {
  if (mcc >= 5411 && mcc <= 5499) return '#e8f5e9';
  if (mcc >= 5811 && mcc <= 5814) return '#fff3e0';
  if (mcc >= 4111 && mcc <= 4131) return '#e3f2fd';
  if (mcc >= 5912 && mcc <= 5999) return '#fce4ec';
  return '#f9f9f9';
};

const mccLabel = (mcc: number) => {
  if (mcc >= 5411 && mcc <= 5499) return '🛒';
  if (mcc >= 5811 && mcc <= 5814) return '🍽️';
  if (mcc >= 4111 && mcc <= 4131) return '🚌';
  if (mcc >= 5912 && mcc <= 5999) return '💊';
  if (mcc === 0) return '✏️';
  return '💳';
};

const SOURCE_ICON: Record<string, string> = { mono: '🟡', manual: '✏️' };
const TYPE_ICON: Record<string, string> = {
  black: '🖤',
  white: '🤍',
  platinum: '🔘',
  iron: '⚙️',
  fop: '🏢',
  yellow: '💛',
  eAid: '🟢',

  cash: '💵',
  creditCard: '💳',
  debitCard: '💳',
  savings: '🏦',
  prepaid: '🧾',        // Передоплата → Prepaid
  investments: '📈',
  loan: '📉',
  credit: '💰',
  other: '📦',
};

function txDate(time: number) {
  const d = new Date(time < 1e10 ? time * 1000 : time);
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr: string, lang: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language } = useAppSettings();

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch account + all transactions then filter
      const [accs, txs] = await Promise.all([
        apiFetch('/accounts'),
        apiFetch('/transactions'),
      ]);
      const acc = accs.find((a: Account) => String(a.id) === String(id));
      if (!acc) { Alert.alert('Not found'); router.back(); return; }
      setAccount(acc);
      setTransactions(txs.filter((tx: Transaction) => String(tx.account_id) === String(id)));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, []);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account?.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiFetch(`/accounts/${id}`, { method: 'DELETE' });
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e.message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // ── Group transactions by day ───────────────────────────────────────────────
  const byDay: Record<string, Transaction[]> = {};
  transactions.forEach(tx => {
    const key = txDate(tx.time);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(tx);
  });
  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalIn = transactions.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);
  const totalOut = transactions.filter(tx => tx.amount < 0).reduce((s, tx) => s + tx.amount, 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (!account) return null;

  const sym = currencySymbol(account.currency_code);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#fff" />
        }
      >
        {/* ── Hero Header ── */}
        <View style={styles.hero}>
          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          {/* Account icon + name */}
          <Text style={styles.heroIcon}>
            {TYPE_ICON[account.type] ?? SOURCE_ICON[account.source] ?? '🏦'}
          </Text>
          <Text style={styles.heroName}>{account.name}</Text>
          <Text style={styles.heroType}>{account.type ?? account.source}</Text>

          {/* Balance */}
          <Text style={styles.heroBalance}>
            {sym}{(account.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={[styles.statValue, styles.positive]}>+{sym}{totalIn.toFixed(2)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Expenses</Text>
              <Text style={[styles.statValue, styles.negative]}>{sym}{totalOut.toFixed(2)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Transactions</Text>
              <Text style={styles.statValue}>{transactions.length}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.editBtn} onPress={() => setShowEdit(true)}>
              <Text style={styles.editBtnText}>✏️  Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.deleteBtnText}>🗑  Delete</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Transactions ── */}
        <View style={styles.txSection}>
          <Text style={styles.txSectionTitle}>Transaction History</Text>

          {sortedDays.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          ) : sortedDays.map(day => {
            const dayTotal = byDay[day].reduce((s, tx) => s + tx.amount, 0);
            return (
              <View key={day} style={styles.dayBlock}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{formatDate(day, language)}</Text>
                  <Text style={[styles.dayTotal, dayTotal < 0 ? styles.negative : styles.positive]}>
                    {dayTotal > 0 ? '+' : ''}{dayTotal.toFixed(2)}
                  </Text>
                </View>
                {byDay[day].map(tx => (
                  <View key={tx.id} style={[styles.txRow, { backgroundColor: mccColor(tx.mcc) }]}>
                    <Text style={styles.txIcon}>{mccLabel(tx.mcc)}</Text>
                    <View style={styles.txMid}>
                      <Text style={styles.txDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                      <Text style={styles.txMeta}>
                        {tx.source}
                        {tx.mcc ? `  ·  MCC ${tx.mcc}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.txAmount, tx.amount < 0 ? styles.negative : styles.positive]}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} {currencySymbol(tx.currency_code)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Edit Modal ── */}
      {account && (
        <EditAccountModal
          visible={showEdit}
          account={account}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            fetchData();
          }}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BRAND = '#8B1A1A';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' },

  // Hero
  hero: {
    backgroundColor: BRAND,
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 56,
    left: 20,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backText: { color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' },

  heroIcon: { fontSize: 48, marginBottom: 10, marginTop: 16 },
  heroName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroType: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)',
    textTransform: 'capitalize', marginTop: 4, marginBottom: 16,
  },
  heroBalance: {
    fontSize: 44, fontWeight: '800', color: '#fff',
    letterSpacing: -1, marginBottom: 24,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '100%',
    marginBottom: 20,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 12, width: '100%' },
  editBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  deleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deleteBtnText: { color: '#ffaaaa', fontWeight: '700', fontSize: 15 },

  // Transactions section
  txSection: { padding: 16 },
  txSectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 14, marginLeft: 4,
  },

  empty: { alignItems: 'center', marginTop: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#aaa' },

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
  dayLabel: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayTotal: { fontSize: 13, fontWeight: '700' },

  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  txIcon: { fontSize: 22, marginRight: 12 },
  txMid: { flex: 1 },
  txDesc: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  txMeta: { fontSize: 11, color: '#aaa', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  txAmount: { fontSize: 14, fontWeight: '700' },

  positive: { color: '#27ae60' },
  negative: { color: '#c0392b' },
});