import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Alert, RefreshControl, TouchableOpacity,
} from 'react-native';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t, Currency } from '@/components/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Account {
  id: number;
  name: string;
  type: string;
  source: string;
  currency_code: number;
  balance?: number;
}

interface ExchangeRates {
  USD: number;
  EUR: number;
}

// ── Currency helpers ──────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<number, string> = { 980: '₴', 840: '$', 978: '€', 826: '£' };
const CODE_MAP: Record<number, Currency | null> = { 980: 'UAH', 840: 'USD', 978: 'EUR' };
const currencySymbol = (code: number) => CURRENCY_SYMBOLS[code] ?? '?';

const SYSTEM_CURRENCY_CODE: Record<Currency, number> = { UAH: 980, USD: 840, EUR: 978 };
const SYSTEM_SYMBOL: Record<Currency, string> = { UAH: '₴', USD: '$', EUR: '€' };

// Convert amount in `fromCode` to system currency
function convertToSystem(amount: number, fromCode: number, systemCurrency: Currency, rates: ExchangeRates): number | null {
  const from = CODE_MAP[fromCode];
  if (!from || from === systemCurrency) return amount;

  // All rates are UAH-based (1 USD = X UAH, 1 EUR = X UAH)
  const toUAH = (a: number, c: Currency): number => {
    if (c === 'UAH') return a;
    if (c === 'USD') return a * rates.USD;
    if (c === 'EUR') return a * rates.EUR;
    return a;
  };
  const fromUAH = (a: number, c: Currency): number => {
    if (c === 'UAH') return a;
    if (c === 'USD') return a / rates.USD;
    if (c === 'EUR') return a / rates.EUR;
    return a;
  };

  const inUAH = toUAH(amount, from);
  return fromUAH(inUAH, systemCurrency);
}

const SOURCE_ICON: Record<string, string> = { mono: '🟡', manual: '✏️', default: '🏦' };

export default function AccountsScreen() {
  const { currency, language } = useAppSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rates, setRates] = useState<ExchangeRates>({ USD: 41.5, EUR: 44.8 }); // fallback
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const accs = await apiFetch('/accounts');
      setAccounts(accs);

      // Fetch live rates from NBU (public, no auth needed)
      try {
        const nbu = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
        const rateData = await nbu.json();
        const usd = rateData.find((r: any) => r.cc === 'USD')?.rate;
        const eur = rateData.find((r: any) => r.cc === 'EUR')?.rate;
        if (usd && eur) setRates({ USD: usd, EUR: eur });
      } catch {
        // keep fallback rates
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  // Total balance in system currency
  const totalBalance = accounts.reduce((sum, acc) => {
    const converted = convertToSystem(acc.balance ?? 0, acc.currency_code, currency, rates);
    return sum + (converted ?? 0);
  }, 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={BRAND} />}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('accounts', language)}</Text>
      </View>

      {/* ── Total Balance Card ── */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>{t('total_balance', language)}</Text>
        <Text style={styles.totalAmount}>
          {SYSTEM_SYMBOL[currency]}{totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={styles.totalCurrency}>{currency}</Text>
      </View>

      {/* ── Currency Rates ── */}
      <Text style={styles.sectionTitle}>{t('currency_rates', language)}</Text>
      <View style={styles.ratesRow}>
        <View style={styles.rateCard}>
          <Text style={styles.rateFlag}>🇺🇸</Text>
          <Text style={styles.rateCurrency}>USD</Text>
          <Text style={styles.rateValue}>₴{rates.USD.toFixed(2)}</Text>
        </View>
        <View style={styles.rateCard}>
          <Text style={styles.rateFlag}>🇪🇺</Text>
          <Text style={styles.rateCurrency}>EUR</Text>
          <Text style={styles.rateValue}>₴{rates.EUR.toFixed(2)}</Text>
        </View>
      </View>

      {/* ── Accounts List ── */}
      <Text style={styles.sectionTitle}>{t('accounts', language)}</Text>
      {accounts.map(acc => {
        const isSameCurrency = CODE_MAP[acc.currency_code] === currency;
        const approx = !isSameCurrency
          ? convertToSystem(acc.balance ?? 0, acc.currency_code, currency, rates)
          : null;

        return (
          <View key={acc.id} style={styles.accountCard}>
            <View style={styles.accountTop}>
              <View style={styles.accountLeft}>
                <Text style={styles.accountIcon}>
                  {SOURCE_ICON[acc.source] ?? SOURCE_ICON.default}
                </Text>
                <View>
                  <Text style={styles.accountName}>{acc.name}</Text>
                  <Text style={styles.accountType}>{acc.type ?? acc.source}</Text>
                </View>
              </View>
              <View style={styles.accountRight}>
                <Text style={styles.accountBalance}>
                  {currencySymbol(acc.currency_code)}{(acc.balance ?? 0).toFixed(2)}
                </Text>
                {approx !== null && (
                  <Text style={styles.accountApprox}>
                    {t('approx', language)} {SYSTEM_SYMBOL[currency]}{approx.toFixed(2)}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BRAND = '#8B1A1A';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },

  // Total balance
  totalCard: {
    margin: 16,
    backgroundColor: BRAND,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  totalAmount: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  totalCurrency: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: '600' },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginHorizontal: 20, marginTop: 8, marginBottom: 12,
  },

  // Rates
  ratesRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 20 },
  rateCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  rateFlag: { fontSize: 24, marginBottom: 6 },
  rateCurrency: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.5 },
  rateValue: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginTop: 2 },

  // Account cards
  accountCard: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginBottom: 10, padding: 16,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  accountTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accountLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountIcon: { fontSize: 28 },
  accountName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  accountType: { fontSize: 12, color: '#aaa', marginTop: 2, textTransform: 'capitalize' },
  accountRight: { alignItems: 'flex-end' },
  accountBalance: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  accountApprox: { fontSize: 12, color: '#aaa', marginTop: 2 },
});
