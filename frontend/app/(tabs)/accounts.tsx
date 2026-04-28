import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Alert, RefreshControl, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Pressable, useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import { useTranslation } from 'react-i18next';
import CreateAccountModal from '@/components/CreateAccountModal';
import ManageCurrenciesModal from '@/components/ManageCurrenciesModal';
import {
  CURRENCY_FLAGS,
  DEFAULT_CURRENCIES,
  CURRENCIES_STORE_KEY,
  systemCurrencySymbol,
  type NBURate,
} from '@/constants/displayCurrencies';
import { useFocusEffect } from 'expo-router';
import type { Account } from '@/types';
import { BRAND, currencySymbol } from '@/constants/brand';
import { monoAccountDisplayName } from '@/utils/monoAccountDisplayName';
import { convertAmountToSystem } from '@/utils/convertToSystemCurrency';

const SOURCE_ICON: Record<string, string> = { mono: '🟡', manual: '✏️', default: '🏦' };
const TYPE_ICON: Record<string, string> = {
  black: '🖤', white: '🤍', platinum: '🔘', iron: '⚙️', fop: '🏢',
  yellow: '🇺🇦', eAid: '🟢', cash: '💵', creditCard: '💳', debitCard: '💳',
  savings: '🏦', prepaid: '🧾', investments: '📈', loan: '📉', credit: '💰', other: '📦',
};

type ChartPeriod = '1W' | '1M' | '3M' | '6M' | '1Y';
const CHART_PERIODS: ChartPeriod[] = ['1W', '1M', '3M', '6M', '1Y'];


function getChartDates(period: ChartPeriod): string[] {
  const totalDays = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[period];
  const maxPoints = { '1W': 7, '1M': 15, '3M': 13, '6M': 13, '1Y': 26 }[period];
  const step = Math.max(1, Math.floor(totalDays / maxPoints));
  const dates: string[] = [];
  const today = new Date();
  for (let i = totalDays; i >= 0; i -= step) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function AccountsScreen() {
  const { currency } = useAppSettings();
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allRates, setAllRates] = useState<Record<string, number>>({ USD: 41.5, EUR: 44.8 });
  const [allRatesList, setAllRatesList] = useState<NBURate[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(DEFAULT_CURRENCIES);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [showConverter, setShowConverter] = useState(false);
  const [converterAmount, setConverterAmount] = useState('');
  const [converterFrom, setConverterFrom] = useState('UAH');

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const [showRateChart, setShowRateChart] = useState(false);
  const [chartCurrency, setChartCurrency] = useState('');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');
  const [chartPoints, setChartPoints] = useState<{ value: number; label: string; date: string }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(CURRENCIES_STORE_KEY).then(val => {
      if (val) {
        try { setSelectedCurrencies(JSON.parse(val)); } catch {}
      }
    });
  }, []);

  const saveSelectedCurrencies = useCallback(async (next: string[]) => {
    setSelectedCurrencies(next);
    await SecureStore.setItemAsync(CURRENCIES_STORE_KEY, JSON.stringify(next));
  }, []);

  const toggleCurrency = (cc: string) => {
    const next = selectedCurrencies.includes(cc)
      ? selectedCurrencies.filter(c => c !== cc)
      : [...selectedCurrencies, cc];
    saveSelectedCurrencies(next);
  };

  const fetchChartData = useCallback(async (cc: string, period: ChartPeriod) => {
    setChartLoading(true);
    setChartPoints([]);
    try {
      const dates = getChartDates(period);
      const ccLower = cc.toLowerCase();

      const results = await Promise.all(
        dates.map(async (dateStr) => {
          try {
            const res = await fetch(
              `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/${ccLower}.min.json`
            );
            if (!res.ok) return null;
            const data = await res.json();
            const rate: number | undefined = data[ccLower]?.uah;
            if (!rate) return null;
            const [, month, day] = dateStr.split('-');
            return { value: rate, label: `${day}/${month}`, date: `${day}/${month}` };
          } catch { return null; }
        })
      );

      const points = results.filter((r): r is { value: number; label: string; date: string } => r !== null);
      const labelStep = Math.max(1, Math.floor(points.length / 6));
      setChartPoints(points.map((p, i) => ({ ...p, label: i % labelStep === 0 ? p.date : '' })));
    } catch {
      setChartPoints([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const openRateChart = (cc: string) => {
    setChartCurrency(cc);
    setChartPeriod('1M');
    setShowRateChart(true);
    fetchChartData(cc, '1M');
  };

  const fetchAll = useCallback(async () => {
    try {
      const accs = await apiFetch('/accounts');
      setAccounts(accs);
      try {
        const nbu = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
        const rateData: NBURate[] = await nbu.json();
        const rateMap: Record<string, number> = {};
        rateData.forEach(r => { rateMap[r.cc] = r.rate; });
        setAllRates(rateMap);
        setAllRatesList(rateData);
      } catch {}
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const personalBalance = (acc: Account) => (acc.balance ?? 0) - (acc.credit_limit ?? 0);

  const totalBalance = accounts.reduce((sum, acc) =>
    sum + (convertAmountToSystem(acc.balance ?? 0, acc.currency_code, currency, allRates) ?? 0), 0);
  const totalCredit = accounts.reduce((sum, acc) =>
    sum + (convertAmountToSystem(acc.credit_limit ?? 0, acc.currency_code, currency, allRates) ?? 0), 0);
  const totalPersonal = accounts.reduce((sum, acc) =>
    sum + (convertAmountToSystem(personalBalance(acc), acc.currency_code, currency, allRates) ?? 0), 0);
  const hasCreditAccounts = accounts.some(acc => (acc.credit_limit ?? 0) > 0);

  const converterCurrencies = useMemo(() => {
    const fromSelected = ['UAH', ...selectedCurrencies.filter(c => c !== 'UAH')];
    if (!currency || fromSelected.includes(currency)) return fromSelected;
    return [fromSelected[0], currency, ...fromSelected.slice(1)];
  }, [currency, selectedCurrencies]);

  useEffect(() => {
    if (!showConverter) return;
    setConverterFrom(
      currency && converterCurrencies.includes(currency)
        ? currency
        : (converterCurrencies[0] ?? 'UAH'),
    );
  }, [showConverter, currency, converterCurrencies]);

  const getConverted = () => {
    const amt = parseFloat(converterAmount);
    if (!converterAmount || isNaN(amt) || amt <= 0) return null;
    const fromRate = converterFrom === 'UAH' ? 1 : (allRates[converterFrom] ?? 1);
    const uah = amt * fromRate;
    const result: Record<string, number> = {};
    converterCurrencies.forEach(cc => {
      result[cc] = cc === 'UAH' ? uah : uah / (allRates[cc] ?? 1);
    });
    return result;
  };

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
          <Text style={styles.headerTitle}>{t('accounts')}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.addBtnText}>{t('add')}</Text>
          </TouchableOpacity>
        </View>

        {/* Total Balance */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{t('total_balance')}</Text>
          <Text style={styles.totalAmount}>
            {systemCurrencySymbol(currency)}{totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.totalCurrency}>{currency}</Text>
          {hasCreditAccounts && (
            <View style={styles.totalBreakdown}>
              <Text style={styles.totalBreakdownText}>
                {t('credit')}  <Text style={styles.totalBreakdownValue}>{systemCurrencySymbol(currency)}{totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </Text>
              <Text style={styles.totalBreakdownDivider}>·</Text>
              <Text style={styles.totalBreakdownText}>
                {t('personal')}  <Text style={styles.totalBreakdownValue}>{systemCurrencySymbol(currency)}{totalPersonal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Currency Rates */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t('currency_rates')}</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity style={styles.convertBtn} onPress={() => setShowConverter(true)}>
              <Text style={styles.convertBtnText}>{t('convert_button')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editCurrenciesBtn} onPress={() => setShowCurrencyPicker(true)}>
              <Text style={styles.editCurrenciesBtnText}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.ratesScroll}
          contentContainerStyle={styles.ratesScrollContent}
        >
          {selectedCurrencies.map(cc => (
            <TouchableOpacity key={cc} style={styles.rateCard} onPress={() => openRateChart(cc)} activeOpacity={0.75}>
              <Text style={styles.rateFlag}>{CURRENCY_FLAGS[cc] ?? '🏳️'}</Text>
              <View>
                <Text style={styles.rateCurrency}>{cc}</Text>
                <Text style={styles.rateValue}>₴{(allRates[cc] ?? 0).toFixed(2)}</Text>
              </View>
              <Text style={styles.rateChartHint}>↗</Text>
            </TouchableOpacity>
          ))}
          {selectedCurrencies.length === 0 && (
            <TouchableOpacity style={styles.rateCardEmpty} onPress={() => setShowCurrencyPicker(true)}>
              <Text style={styles.rateCardEmptyText}>{t('add_currencies')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Accounts List */}
        <Text style={[styles.sectionTitle, styles.accountsSectionTitle]}>{t('accounts')}</Text>

        {accounts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏦</Text>
            <Text style={styles.emptyText}>{t('no_accounts_yet')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyBtnText}>{t('create_your_first_account')}</Text>
            </TouchableOpacity>
          </View>
        ) : accounts.map(acc => {
          const balSys = convertAmountToSystem(acc.balance ?? 0, acc.currency_code, currency, allRates);
          const creditSys = (acc.credit_limit ?? 0) > 0
            ? convertAmountToSystem(acc.credit_limit ?? 0, acc.currency_code, currency, allRates)
            : null;
          const personalSys = (acc.credit_limit ?? 0) > 0
            ? convertAmountToSystem(personalBalance(acc), acc.currency_code, currency, allRates)
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
                    <Text style={styles.accountName}>{monoAccountDisplayName(acc)}</Text>
                    <Text style={styles.accountType}>{acc.type ?? acc.source}</Text>
                  </View>
                </View>
                <View style={styles.accountRight}>
                  <View style={styles.accountBalanceRow}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.accountBalance, (acc.balance ?? 0) < 0 && { color: NEGATIVE }]}>
                        {balSys !== null
                          ? `${systemCurrencySymbol(currency)}${balSys.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `${currencySymbol(acc.currency_code)}${(acc.balance ?? 0).toFixed(2)}`}
                      </Text>
                      {(acc.credit_limit ?? 0) > 0 && (
                        <>
                          <Text style={styles.creditRow}>
                            <Text style={styles.creditLabel}>{t('credit')} </Text>
                            <Text style={styles.creditValue}>
                              {creditSys !== null
                                ? `${systemCurrencySymbol(currency)}${creditSys.toFixed(2)}`
                                : `${currencySymbol(acc.currency_code)}${acc.credit_limit!.toFixed(2)}`}
                            </Text>
                          </Text>
                          <Text style={styles.creditRow}>
                            <Text style={styles.creditLabel}>{t('personal')}  </Text>
                            <Text style={[styles.creditValue, personalBalance(acc) < 0 && { color: NEGATIVE }]}>
                              {personalSys !== null
                                ? `${systemCurrencySymbol(currency)}${personalSys.toFixed(2)}`
                                : `${currencySymbol(acc.currency_code)}${personalBalance(acc).toFixed(2)}`}
                            </Text>
                          </Text>
                        </>
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

      {/* ── Rate Chart Modal ────────────────────────────────────────────────── */}
      <Modal visible={showRateChart} transparent animationType="slide" onRequestClose={() => setShowRateChart(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowRateChart(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.chartHeader}>
              <Text style={styles.chartFlag}>{CURRENCY_FLAGS[chartCurrency] ?? '🏳️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.chartCurrencyCode}>{chartCurrency} {t('per_uah')}</Text>
                <Text style={styles.chartCurrentRate}>
                  ₴{(allRates[chartCurrency] ?? 0).toFixed(4)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRateChart(false)} style={styles.chartCloseBtn}>
                <Text style={styles.chartCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Period selector */}
            <View style={styles.periodRow}>
              {CHART_PERIODS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodBtn, chartPeriod === p && styles.periodBtnActive]}
                  onPress={() => { setChartPeriod(p); fetchChartData(chartCurrency, p); }}
                >
                  <Text style={[styles.periodBtnText, chartPeriod === p && styles.periodBtnTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Chart */}
            <View style={styles.chartArea}>
              {chartLoading ? (
                <ActivityIndicator color={BRAND} style={{ marginVertical: 40 }} />
              ) : chartPoints.length < 2 ? (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyText}>{t('no_data')}</Text>
                </View>
              ) : (() => {
                const vals = chartPoints.map(p => p.value);
                const rawMin = Math.min(...vals);
                const rawMax = Math.max(...vals);
                // ±20% of the data range as padding on each side
                const pad = Math.max((rawMax - rawMin) * 0.2, rawMax * 0.001);
                const yMin = Math.max(0, rawMin - pad);
                const yMax = rawMax + pad;
                const yRange = yMax - yMin;
                const chartW = screenWidth - 100;
                return (
                  <LineChart
                    data={chartPoints}
                    width={chartW}
                    height={190}
                    color={BRAND}
                    thickness={2.5}
                    curved
                    areaChart
                    startFillColor={BRAND}
                    startOpacity={0.28}
                    endOpacity={0.0}
                    initialSpacing={0}
                    endSpacing={0}
                    spacing={chartW / Math.max(chartPoints.length - 1, 1)}
                    hideDataPoints={chartPoints.length > 15}
                    dataPointsColor={BRAND}
                    dataPointsRadius={4}
                    noOfSections={4}
                    yAxisOffset={yMin}
                    maxValue={yRange}
                    yAxisLabelWidth={50}
                    formatYLabel={(v) => `₴${parseFloat(v).toFixed(2)}`}
                    yAxisTextStyle={{ color: '#aaa', fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: '#aaa', fontSize: 9 }}
                    rulesColor="#f0f0f0"
                    rulesType="solid"
                    yAxisColor="transparent"
                    xAxisColor="#f0f0f0"
                    isAnimated
                    animationDuration={600}
                    pointerConfig={{
                      pointerStripHeight: 185,
                      pointerStripColor: 'rgba(0,0,0,0.1)',
                      pointerStripWidth: 1.5,
                      pointerColor: BRAND,
                      radius: 6,
                      pointerLabelWidth: 92,
                      pointerLabelHeight: 52,
                      activatePointersOnLongPress: false,
                      autoAdjustPointerLabelPosition: true,
                      pointerLabelComponent: (items: { value: number; date: string; label: string }[]) => {
                        const item = items[0];
                        if (!item) return null;
                        return (
                          <View style={styles.chartTooltip}>
                            <Text style={styles.chartTooltipDate}>{item.date || item.label}</Text>
                            <Text style={styles.chartTooltipValue}>₴{item.value.toFixed(4)}</Text>
                          </View>
                        );
                      },
                    }}
                  />
                );
              })()}
            </View>

            {/* Stats */}
            {chartPoints.length > 1 && (() => {
              const vals = chartPoints.map(p => p.value);
              const mn = Math.min(...vals);
              const mx = Math.max(...vals);
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              const change = vals[vals.length - 1] - vals[0];
              const changePct = (change / vals[0]) * 100;
              return (
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>{t('min_label')}</Text>
                    <Text style={styles.statValue}>₴{mn.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>{t('avg_label')}</Text>
                    <Text style={styles.statValue}>₴{avg.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>{t('max_label')}</Text>
                    <Text style={styles.statValue}>₴{mx.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>{t('change_label')}</Text>
                    <Text style={[styles.statValue, { color: change >= 0 ? '#2e7d32' : '#c62828' }]}>
                      {change >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Currency Converter Modal ─────────────────────────────────────────── */}
      <Modal visible={showConverter} transparent animationType="slide" onRequestClose={() => setShowConverter(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setShowConverter(false)} />

            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>{t('currency_converter_title')}</Text>
              <Text style={styles.sheetSubtitle}>{t('nbu_rates_prefix')} · {new Date().toLocaleDateString('uk-UA')}</Text>

              {/* Amount input */}
              <TextInput
                style={styles.converterInput}
                value={converterAmount}
                onChangeText={setConverterAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#ccc"
                autoFocus
              />

              {/* From-currency pills (horizontal scroll) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillScroll}
                contentContainerStyle={styles.pillScrollContent}
              >
                {converterCurrencies.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pill, converterFrom === c && styles.pillActive]}
                    onPress={() => setConverterFrom(c)}
                  >
                    <Text style={styles.pillFlag}>{CURRENCY_FLAGS[c] ?? '🏳️'}</Text>
                    <Text style={[styles.pillText, converterFrom === c && styles.pillTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Results */}
              <ScrollView style={styles.converterResults} bounces={false} showsVerticalScrollIndicator>
                {(() => {
                  const result = getConverted();
                  return converterCurrencies.map(cc => (
                    <View key={cc} style={[styles.converterResultRow, cc === converterFrom && styles.converterResultRowActive]}>
                      <Text style={styles.converterResultFlag}>{CURRENCY_FLAGS[cc] ?? '🏳️'}</Text>
                      <Text style={styles.converterResultCode}>{cc}</Text>
                      <Text style={[styles.converterResultValue, cc === converterFrom && styles.converterResultValueActive]}>
                        {result
                          ? result[cc].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}
                      </Text>
                    </View>
                  ));
                })()}
              </ScrollView>

              <Text style={styles.rateHint}>
                $1 = ₴{(allRates.USD ?? 0).toFixed(2)}  ·  €1 = ₴{(allRates.EUR ?? 0).toFixed(2)}
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ManageCurrenciesModal
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        rates={allRatesList}
        selectedCurrencies={selectedCurrencies}
        onToggle={toggleCurrency}
      />
    </>
  );
}

const NEGATIVE = '#D32F2F';

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
  totalBreakdown: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  totalBreakdownText: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  totalBreakdownValue: { fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  totalBreakdownDivider: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },

  // Section header row
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginTop: 8, marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase' },
  accountsSectionTitle: { marginHorizontal: 20, marginTop: 8, marginBottom: 12 },
  sectionActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  convertBtn: { backgroundColor: BRAND + '15', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  convertBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },
  editCurrenciesBtn: { backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  editCurrenciesBtnText: { fontSize: 14, color: '#666' },

  // Rate cards (horizontal scroll)
  ratesScroll: { marginBottom: 20 },
  ratesScrollContent: { paddingHorizontal: 16, gap: 10, paddingRight: 24 },
  rateCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  rateFlag: { fontSize: 22 },
  rateCurrency: { fontSize: 12, fontWeight: '700', color: '#888' },
  rateValue: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginTop: 1 },
  rateChartHint: { fontSize: 13, color: '#ccc', marginLeft: 4 },
  rateCardEmpty: {
    backgroundColor: '#f5f5f5', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#e8e8e8', borderStyle: 'dashed',
  },
  rateCardEmptyText: { fontSize: 13, fontWeight: '600', color: '#aaa' },

  // Account cards
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

  // Shared modal primitives
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },  // fills space above sheet — never overlaps it
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
  },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  sheetSubtitle: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4, marginBottom: 20 },

  // Rate chart modal
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  chartFlag: { fontSize: 36 },
  chartCurrencyCode: { fontSize: 16, fontWeight: '700', color: '#888' },
  chartCurrentRate: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
  chartCloseBtn: { padding: 8 },
  chartCloseBtnText: { fontSize: 16, color: '#aaa', fontWeight: '600' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  periodBtnActive: { backgroundColor: BRAND },
  periodBtnText: { fontSize: 13, fontWeight: '700', color: '#888' },
  periodBtnTextActive: { color: '#fff' },
  chartArea: { minHeight: 190, justifyContent: 'center', marginBottom: 16 },
  chartEmpty: { height: 190, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { color: '#aaa', fontSize: 14 },
  chartTooltip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  chartTooltipDate: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 2 },
  chartTooltipValue: { fontSize: 13, fontWeight: '800' as const, color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statBox: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12, padding: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  statLabel: { fontSize: 10, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: '800', color: '#1a1a1a' },

  // Converter
  converterInput: {
    fontSize: 42, fontWeight: '800', color: '#1a1a1a', textAlign: 'center',
    borderBottomWidth: 2, borderBottomColor: BRAND, paddingBottom: 8, marginBottom: 16, letterSpacing: -1,
  },
  pillScroll: { marginBottom: 16 },
  pillScrollContent: { gap: 8, paddingHorizontal: 2 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#f5f5f5',
  },
  pillActive: { backgroundColor: BRAND },
  pillFlag: { fontSize: 14 },
  pillText: { fontSize: 13, fontWeight: '700', color: '#888' },
  pillTextActive: { color: '#fff' },
  converterResults: {
    borderRadius: 16, borderWidth: 1, borderColor: '#f0f0f0', marginBottom: 14, maxHeight: 240,
  },
  converterResultRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: '#fff', gap: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  converterResultRowActive: { backgroundColor: BRAND + '0D' },
  converterResultFlag: { fontSize: 20 },
  converterResultCode: { fontSize: 14, fontWeight: '700', color: '#888', flex: 1 },
  converterResultValue: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  converterResultValueActive: { color: BRAND },
  rateHint: { fontSize: 12, color: '#bbb', textAlign: 'center' },
});
