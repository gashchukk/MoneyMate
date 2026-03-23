import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Alert, RefreshControl, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/constants/api';
import { useAppSettings, t, Currency } from '@/components/AppContext';
import CreateAccountModal from '@/components/CreateAccountModal';
import { useFocusEffect } from 'expo-router';
import type { Account } from '@/types';
import { BRAND, currencySymbol } from '@/constants/brand';

interface ExchangeRates { USD: number; EUR: number; }

const CODE_MAP: Record<number, Currency | null> = { 980: 'UAH', 840: 'USD', 978: 'EUR' };
const SYSTEM_SYMBOL: Record<Currency, string> = { UAH: '₴', USD: '$', EUR: '€' };
const SOURCE_ICON: Record<string, string> = { mono: '🟡', manual: '✏️', default: '🏦' };
const TYPE_ICON: Record<string, string> = {
  black: '🖤',
  white: '🤍',
  platinum: '🔘',
  iron: '⚙️',
  fop: '🏢',
  yellow: '🇺🇦',
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

function convertToSystem(amount: number, fromCode: number, sys: Currency, rates: ExchangeRates): number | null {
  const from = CODE_MAP[fromCode];
  if (!from || from === sys) return amount;
  const toUAH = (a: number, c: Currency) => c === 'UAH' ? a : c === 'USD' ? a * rates.USD : a * rates.EUR;
  const fromUAH = (a: number, c: Currency) => c === 'UAH' ? a : c === 'USD' ? a / rates.USD : a / rates.EUR;
  return fromUAH(toUAH(amount, from), sys);
}

export default function AccountsScreen() {
  const { currency, language } = useAppSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rates, setRates] = useState<ExchangeRates>({ USD: 41.5, EUR: 44.8 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const accs = await apiFetch('/accounts');
      setAccounts(accs);
      try {
        const nbu = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
        const rateData = await nbu.json();
        const usd = rateData.find((r: any) => r.cc === 'USD')?.rate;
        const eur = rateData.find((r: any) => r.cc === 'EUR')?.rate;
        if (usd && eur) setRates({ USD: usd, EUR: eur });
      } catch {}
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  // Personal funds = balance minus credit limit (own money, excluding credit line)
  const personalBalance = (acc: Account) => (acc.balance ?? 0) - (acc.credit_limit ?? 0);

  const totalBalance = accounts.reduce((sum, acc) => {
    return sum + (convertToSystem(personalBalance(acc), acc.currency_code, currency, rates) ?? 0);
  }, 0);

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
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('accounts', language)}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Total Balance */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{t('total_balance', language)}</Text>
          <Text style={styles.totalAmount}>
            {SYSTEM_SYMBOL[currency]}{totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.totalCurrency}>{currency}</Text>
        </View>

        {/* Currency Rates */}
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

        {/* Accounts List */}
        <Text style={styles.sectionTitle}>{t('accounts', language)}</Text>

        {accounts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏦</Text>
            <Text style={styles.emptyText}>No accounts yet</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyBtnText}>+ Create your first account</Text>
            </TouchableOpacity>
          </View>
        ) : accounts.map(acc => {
          const isSameCurrency = CODE_MAP[acc.currency_code] === currency;
          const approx = !isSameCurrency
            ? convertToSystem(acc.balance ?? 0, acc.currency_code, currency, rates)
            : null;

          return (
            <TouchableOpacity
              key={acc.id}
              style={styles.accountCard}
              onPress={() => router.push(`/account/${acc.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.accountTop}>
                <View style={styles.accountLeft}>
                  <Text style={styles.accountIcon}>
                    {TYPE_ICON[acc.type] ?? SOURCE_ICON[acc.source] ?? SOURCE_ICON.default}
                  </Text>
                  <View>
                    <Text style={styles.accountName}>{acc.name}</Text>
                    <Text style={styles.accountType}>{acc.type ?? acc.source}</Text>
                  </View>
                </View>
                <View style={styles.accountRight}>
                  <View style={styles.accountBalanceRow}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.accountBalance,
                          (acc.balance ?? 0) < 0 && { color: NEGATIVE }
                        ]}
                      >
                        {currencySymbol(acc.currency_code)}{(acc.balance ?? 0).toFixed(2)}
                      </Text>
                      {(acc.credit_limit ?? 0) > 0 && (
                        <>
                          <Text style={styles.creditRow}>
                            <Text style={styles.creditLabel}>Credit  </Text>
                            <Text style={styles.creditValue}>{currencySymbol(acc.currency_code)}{acc.credit_limit!.toFixed(2)}</Text>
                          </Text>
                          <Text style={styles.creditRow}>
                            <Text style={styles.creditLabel}>Personal  </Text>
                            <Text style={[styles.creditValue, personalBalance(acc) < 0 && { color: NEGATIVE }]}>
                              {currencySymbol(acc.currency_code)}{personalBalance(acc).toFixed(2)}
                            </Text>
                          </Text>
                        </>
                      )}
                      {approx !== null && (
                        <Text style={styles.accountApprox}>
                          {t('approx', language)} {SYSTEM_SYMBOL[currency]}{approx.toFixed(2)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <CreateAccountModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); fetchAll(); }}
      />
    </>
  );
}

const NEGATIVE = '#D32F2F'; // clean red
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  addBtn: { backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  totalCard: {
    margin: 16, backgroundColor: BRAND, borderRadius: 24, padding: 28, alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  totalAmount: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  totalCurrency: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: '600' },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#888', letterSpacing: 0.8,
    textTransform: 'uppercase', marginHorizontal: 20, marginTop: 8, marginBottom: 12,
  },
  ratesRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 20 },
  rateCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  rateFlag: { fontSize: 20 },
  rateCurrency: { fontSize: 13, fontWeight: '700', color: '#888', flex: 1 },
  rateValue: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  accountCard: {
    backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 10, padding: 16,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  accountTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accountLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountIcon: { fontSize: 28 },
  accountName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  accountType: { fontSize: 12, color: '#aaa', marginTop: 2, textTransform: 'capitalize' },
  accountRight: { alignItems: 'flex-end' },
  accountBalanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountBalance: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'right' },
  accountApprox: { fontSize: 12, color: '#aaa', marginTop: 2, textAlign: 'right' },
  creditRow: { fontSize: 12, marginTop: 2, textAlign: 'right' },
  creditLabel: { color: '#aaa' },
  creditValue: { color: '#555', fontWeight: '600' },
  chevron: { fontSize: 24, color: '#ccc', fontWeight: '300' },
  empty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#aaa', marginBottom: 16 },
  emptyBtn: { backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});