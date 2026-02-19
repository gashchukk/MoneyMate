import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, StatusBar, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<number, string> = { 980: '₴', 840: '$', 978: '€', 826: '£' };
const CURRENCY_NAMES: Record<number, string> = { 980: 'UAH', 840: 'USD', 978: 'EUR', 826: 'GBP' };
const currencySymbol = (code: number) => CURRENCY_SYMBOLS[code] ?? '?';

const MCC_CATEGORIES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  grocery:    { label: 'Groceries',   icon: '🛒', color: '#27ae60', bg: '#e8f5e9' },
  restaurant: { label: 'Dining',      icon: '🍽️', color: '#e67e22', bg: '#fff3e0' },
  transport:  { label: 'Transport',   icon: '🚌', color: '#2980b9', bg: '#e3f2fd' },
  health:     { label: 'Health',      icon: '💊', color: '#e91e63', bg: '#fce4ec' },
  manual:     { label: 'Manual',      icon: '✏️', color: '#8B1A1A', bg: '#fff5f5' },
  other:      { label: 'Other',       icon: '💳', color: '#7f8c8d', bg: '#f5f5f5' },
};

function getMccCategory(mcc: number, source: string) {
  if (mcc === 0 || source === 'manual') return MCC_CATEGORIES.manual;
  if (mcc >= 5411 && mcc <= 5499) return MCC_CATEGORIES.grocery;
  if (mcc >= 5811 && mcc <= 5814) return MCC_CATEGORIES.restaurant;
  if (mcc >= 4111 && mcc <= 4131) return MCC_CATEGORIES.transport;
  if (mcc >= 5912 && mcc <= 5999) return MCC_CATEGORIES.health;
  return MCC_CATEGORIES.other;
}

function formatDateTime(time: number) {
  const d = new Date(time < 1e10 ? time * 1000 : time);
  return {
    date: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language } = useAppSettings();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Edit form state
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
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
      const acc = accs.find((a: Account) => a.id === found.account_id);
      setAccount(acc ?? null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { fetchData(); }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
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

  // ── Edit / Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive number.');
      return;
    }
    if (!tx) return;
    setSaving(true);
    try {
      // Preserve original sign (expense stays negative, income stays positive)
      const newAmount = tx.amount < 0 ? -parsed : parsed;
      const updated = await apiFetch(`/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: editDesc,
          amount: newAmount,
          account_id: tx.account_id,
          time: tx.time,
          mcc: tx.mcc,
          currency_code: tx.currency_code,
        }),
      });
      setTx(updated);
      setShowEdit(false);
    } catch (e: any) {
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
  const { date, time: timeStr } = formatDateTime(tx.time);
  const isExpense = tx.amount < 0;
  const amountColor = isExpense ? '#c0392b' : '#27ae60';

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>

        {/* ── Nav bar ── */}
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Transaction</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* ── Amount Hero ── */}
        <View style={[styles.hero, { backgroundColor: cat.bg }]}>
          <Text style={styles.heroIcon}>{cat.icon}</Text>
          <Text style={[styles.heroAmount, { color: amountColor }]}>
            {isExpense ? '−' : '+'}{currencySymbol(tx.currency_code)}{Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <View style={[styles.catBadge, { backgroundColor: cat.color + '20' }]}>
            <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        </View>

        {/* ── Details Card ── */}
        <View style={styles.card}>
          <DetailRow label="Description" value={tx.description || '—'} />
          <DetailRow label="Date" value={date} />
          <DetailRow label="Time" value={timeStr} />
          <DetailRow label="Account" value={account?.name ?? `Account #${tx.account_id}`} />
          <DetailRow label="Currency" value={CURRENCY_NAMES[tx.currency_code] ?? String(tx.currency_code)} />
          <DetailRow label="Source" value={tx.source} capitalize />
          {tx.mcc > 0 && <DetailRow label="MCC Code" value={String(tx.mcc)} last />}
        </View>

        {/* ── Edit note for Mono transactions ── */}
        {tx.source === 'mono' && (
          <View style={styles.monoNote}>
            <Text style={styles.monoNoteText}>
              ⚠️ This is a Monobank transaction. Edits may be overwritten on next sync.
            </Text>
          </View>
        )}

        {/* ── Action Buttons ── */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => setShowEdit(true)}>
            <Text style={styles.editBtnText}>✏️  Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
            {deleting
              ? <ActivityIndicator color="#c0392b" size="small" />
              : <Text style={styles.deleteBtnText}>🗑  Delete</Text>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Edit Transaction</Text>

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Coffee, Salary..."
              placeholderTextColor="#bbb"
              value={editDesc}
              onChangeText={setEditDesc}
            />

            <Text style={styles.modalLabel}>Amount</Text>
            <View style={[styles.amountRow, { borderColor: amountColor + '60' }]}>
              <Text style={[styles.amountSign, { color: amountColor }]}>
                {isExpense ? '−' : '+'}
              </Text>
              <TextInput
                style={[styles.amountInput, { color: amountColor }]}
                placeholder="0.00"
                placeholderTextColor={amountColor + '40'}
                keyboardType="numeric"
                value={editAmount}
                onChangeText={setEditAmount}
              />
              <Text style={styles.amountCurrency}>
                {CURRENCY_NAMES[tx.currency_code] ?? ''}
              </Text>
            </View>

            <Text style={styles.signNote}>
              {isExpense ? 'This is an expense — amount will be saved as negative.' : 'This is income — amount will be saved as positive.'}
            </Text>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEdit(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
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
const BRAND = '#8B1A1A';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' },

  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: { width: 60 },
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
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 48,
  },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 24 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  modalInput: {
    backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1.5, borderColor: '#eee', marginBottom: 20,
  },
  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderRadius: 16, paddingHorizontal: 16,
    marginBottom: 8, backgroundColor: '#fafafa',
  },
  amountSign: { fontSize: 30, fontWeight: '300', marginRight: 6, width: 28, textAlign: 'center' },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', paddingVertical: 14 },
  amountCurrency: { fontSize: 14, fontWeight: '600', color: '#aaa' },
  signNote: { fontSize: 12, color: '#aaa', marginBottom: 24, marginLeft: 2 },

  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#888' },
  saveBtn: {
    flex: 1, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});