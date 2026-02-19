import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t } from '@/components/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Account {
  id: number;
  name: string;
  type: string;
  source: string;
  currency_code: number;
  balance?: number;
}

interface Props {
  visible: boolean;
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}

const ACCOUNT_TYPES = ['black', 'white', 'platinum', 'iron', 'fop', 'yellow', 'eAid'];
const CURRENCIES = [
  { code: 980, label: '₴ UAH' },
  { code: 840, label: '$ USD' },
  { code: 978, label: '€ EUR' },
  { code: 826, label: '£ GBP' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function EditAccountModal({ visible, account, onClose, onSaved }: Props) {
  const { language } = useAppSettings();

  const [name, setName] = useState('');
  const [type, setType] = useState('black');
  const [balance, setBalance] = useState('');
  const [currencyCode, setCurrencyCode] = useState(980);
  const [saving, setSaving] = useState(false);

  // Populate form when account changes
  useEffect(() => {
    if (account) {
      setName(account.name ?? '');
      setType(account.type ?? 'black');
      setBalance(String(account.balance ?? '0'));
      setCurrencyCode(account.currency_code ?? 980);
    }
  }, [account, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an account name.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/accounts/${account.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          type,
          balance: parseFloat(balance) || 0,
          currency_code: currencyCode,
        }),
      });
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Edit Account</Text>

            {/* ── Name ── */}
            <Text style={styles.label}>Account Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Main Card"
              placeholderTextColor="#bbb"
              value={name}
              onChangeText={setName}
            />

            {/* ── Type ── */}
            <Text style={styles.label}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {ACCOUNT_TYPES.map(tp => (
                <TouchableOpacity
                  key={tp}
                  style={[styles.chip, type === tp && styles.chipActive]}
                  onPress={() => setType(tp)}
                >
                  <Text style={[styles.chipText, type === tp && styles.chipTextActive]}>
                    {tp}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── Currency ── */}
            <Text style={styles.label}>Currency</Text>
            <View style={styles.currencyRow}>
              {CURRENCIES.map(c => (
                <TouchableOpacity
                  key={c.code}
                  style={[styles.currencyChip, currencyCode === c.code && styles.currencyChipActive]}
                  onPress={() => setCurrencyCode(c.code)}
                >
                  <Text style={[styles.currencyChipText, currencyCode === c.code && styles.currencyChipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Balance ── */}
            <Text style={styles.label}>Balance</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              value={balance}
              onChangeText={setBalance}
            />

            {/* ── Buttons ── */}
            <View style={styles.btns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveText}>Save Changes</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BRAND = '#8B1A1A';

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 48, maxHeight: '88%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#e0e0e0',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 24 },

  label: {
    fontSize: 12, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#1a1a1a',
    borderWidth: 1.5, borderColor: '#eee', marginBottom: 20,
  },

  chipScroll: { marginBottom: 20 },
  chip: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#f0f0f0', marginRight: 8,
  },
  chipActive: { backgroundColor: BRAND },
  chipText: { fontSize: 13, fontWeight: '600', color: '#555', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },

  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  currencyChip: {
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10,
    backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: 'transparent',
  },
  currencyChipActive: { backgroundColor: '#fff5f5', borderColor: BRAND },
  currencyChipText: { fontSize: 14, fontWeight: '700', color: '#666' },
  currencyChipTextActive: { color: BRAND },

  btns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#888' },
  saveBtn: {
    flex: 1, backgroundColor: BRAND, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});