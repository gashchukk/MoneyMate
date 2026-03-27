import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Alert, RefreshControl, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Pressable, FlatList, useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings, Currency } from '@/components/AppContext';
import { useTranslation } from 'react-i18next';
import CreateAccountModal from '@/components/CreateAccountModal';
import { useFocusEffect } from 'expo-router';
import type { Account } from '@/types';
import { BRAND, currencySymbol } from '@/constants/brand';

interface ExchangeRates { USD: number; EUR: number; }
interface NBURate { cc: string; rate: number; txt: string; }

const CODE_MAP: Record<number, Currency | null> = { 980: 'UAH', 840: 'USD', 978: 'EUR' };
const SYSTEM_SYMBOL: Record<Currency, string> = { UAH: '₴', USD: '$', EUR: '€' };
const SOURCE_ICON: Record<string, string> = { mono: '🟡', manual: '✏️', default: '🏦' };
const TYPE_ICON: Record<string, string> = {
  black: '🖤', white: '🤍', platinum: '🔘', iron: '⚙️', fop: '🏢',
  yellow: '🇺🇦', eAid: '🟢', cash: '💵', creditCard: '💳', debitCard: '💳',
  savings: '🏦', prepaid: '🧾', investments: '📈', loan: '📉', credit: '💰', other: '📦',
};

const CURRENCY_FLAGS: Record<string, string> = {
  UAH: '🇺🇦', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', PLN: '🇵🇱',
  CZK: '🇨🇿', CHF: '🇨🇭', JPY: '🇯🇵', CAD: '🇨🇦', AUD: '🇦🇺',
  HUF: '🇭🇺', NOK: '🇳🇴', SEK: '🇸🇪', DKK: '🇩🇰', RON: '🇷🇴',
  CNY: '🇨🇳', TRY: '🇹🇷', ILS: '🇮🇱', BGN: '🇧🇬', MDL: '🇲🇩',
  ISK: '🇮🇸', BYN: '🇧🇾', KZT: '🇰🇿', GEL: '🇬🇪', AMD: '🇦🇲',
  XAU: '🥇', SGD: '🇸🇬', HKD: '🇭🇰', MXN: '🇲🇽', BRL: '🇧🇷',
  ZAR: '🇿🇦', INR: '🇮🇳', NZD: '🇳🇿', CZK2: '🇨🇿',
};

const DEFAULT_CURRENCIES = ['USD', 'EUR'];
const CURRENCIES_STORE_KEY = 'selected_display_currencies';

type ChartPeriod = '1W' | '1M' | '3M' | '6M' | '1Y';
const CHART_PERIODS: ChartPeriod[] = ['1W', '1M', '3M', '6M', '1Y'];

// Generates evenly-spaced date strings (YYYY-MM-DD) for the given period.
// Capped at ~20 points so we don't fire hundreds of parallel requests.
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

function convertToSystem(amount: number, fromCode: number, sys: Currency, rates: ExchangeRates): number | null {
  const from = CODE_MAP[fromCode];
  if (!from || from === sys) return amount;
  const toUAH = (a: number, c: Currency) => c === 'UAH' ? a : c === 'USD' ? a * rates.USD : a * rates.EUR;
  const fromUAH = (a: number, c: Currency) => c === 'UAH' ? a : c === 'USD' ? a / rates.USD : a / rates.EUR;
  return fromUAH(toUAH(amount, from), sys);
}

export default function AccountsScreen() {
  const { currency } = useAppSettings();
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rates, setRates] = useState<ExchangeRates>({ USD: 41.5, EUR: 44.8 });
  const [allRates, setAllRates] = useState<Record<string, number>>({});
  const [allRatesList, setAllRatesList] = useState<NBURate[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(DEFAULT_CURRENCIES);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Converter
  const [showConverter, setShowConverter] = useState(false);
  const [converterAmount, setConverterAmount] = useState('');
  const [converterFrom, setConverterFrom] = useState('UAH');

  // Currency picker
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');

  // Rate chart
  const [showRateChart, setShowRateChart] = useState(false);
  const [chartCurrency, setChartCurrency] = useState('');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');
  const [chartPoints, setChartPoints] = useState<{ value: number; label: string; date: string }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Load persisted currency selection on mount
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
      // Thin out x-axis labels to ~6 visible, but preserve full date for tooltip
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
        if (rateMap.USD && rateMap.EUR) setRates({ USD: rateMap.USD, EUR: rateMap.EUR });
      } catch {}
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const personalBalance = (acc: Account) => (acc.balance ?? 0) - (acc.credit_limit ?? 0);

  const totalBalance = accounts.reduce((sum, acc) =>
    sum + (convertToSystem(acc.balance ?? 0, acc.currency_code, currency, rates) ?? 0), 0);
  const totalCredit = accounts.reduce((sum, acc) =>
    sum + (convertToSystem(acc.credit_limit ?? 0, acc.currency_code, currency, rates) ?? 0), 0);
  const totalPersonal = accounts.reduce((sum, acc) =>
    sum + (convertToSystem(personalBalance(acc), acc.currency_code, currency, rates) ?? 0), 0);
  const hasCreditAccounts = accounts.some(acc => (acc.credit_limit ?? 0) > 0);

  // Converter — UAH is always first, then selected currencies
  const converterCurrencies = ['UAH', ...selectedCurrencies.filter(c => c !== 'UAH')];

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

  // Currency picker list — filter by search
  const filteredRates = currencySearch.trim()
    ? allRatesList.filter(r =>
        r.cc.toLowerCase().includes(currencySearch.toLowerCase()) ||
        r.txt.toLowerCase().includes(currencySearch.toLowerCase())
      )
    : allRatesList;

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
            {SYSTEM_SYMBOL[currency]}{totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.totalCurrency}>{currency}</Text>
          {hasCreditAccounts && (
            <View style={styles.totalBreakdown}>
              <Text style={styles.totalBreakdownText}>
                {t('credit')}  <Text style={styles.totalBreakdownValue}>{SYSTEM_SYMBOL[currency]}{totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </Text>
              <Text style={styles.totalBreakdownDivider}>·</Text>
              <Text style={styles.totalBreakdownText}>
                {t('personal')}  <Text style={styles.totalBreakdownValue}>{SYSTEM_SYMBOL[currency]}{totalPersonal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Currency Rates */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t('currency_rates')}</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity style={styles.convertBtn} onPress={() => setShowConverter(true)}>
              <Text style={styles.convertBtnText}>⇄ Convert</Text>
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
              <Text style={styles.rateCardEmptyText}>+ Add currencies</Text>
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
                      <Text style={[styles.accountBalance, (acc.balance ?? 0) < 0 && { color: NEGATIVE }]}>
                        {currencySymbol(acc.currency_code)}{(acc.balance ?? 0).toFixed(2)}
                      </Text>
                      {(acc.credit_limit ?? 0) > 0 && (
                        <>
                          <Text style={styles.creditRow}>
                            <Text style={styles.creditLabel}>Credit </Text>
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
                          {t('approx')} {SYSTEM_SYMBOL[currency]}{approx.toFixed(2)}
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
                <Text style={styles.chartCurrencyCode}>{chartCurrency} / UAH</Text>
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
                  <Text style={styles.chartEmptyText}>No data available</Text>
                </View>
              ) : (() => {
                const vals = chartPoints.map(p => p.value);
                const rawMin = Math.min(...vals);
                const rawMax = Math.max(...vals);
                // ±20% of the data range as padding on each side
                const pad = Math.max((rawMax - rawMin) * 0.2, rawMax * 0.001);
                const yMin = Math.max(0, rawMin - pad);
                const yMax = rawMax + pad;
                // maxValue must be the visible RANGE (not absolute max),
                // because gifted-charts positions points as (value - yAxisOffset) / maxValue
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
                    <Text style={styles.statLabel}>Min</Text>
                    <Text style={styles.statValue}>₴{mn.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Avg</Text>
                    <Text style={styles.statValue}>₴{avg.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Max</Text>
                    <Text style={styles.statValue}>₴{mx.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Change</Text>
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
            {/* Backdrop — fills only the space ABOVE the sheet, no overlap */}
            <Pressable style={styles.backdrop} onPress={() => setShowConverter(false)} />

            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Currency Converter</Text>
              <Text style={styles.sheetSubtitle}>NBU rates · {new Date().toLocaleDateString('uk-UA')}</Text>

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
                $1 = ₴{rates.USD.toFixed(2)}  ·  €1 = ₴{rates.EUR.toFixed(2)}
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Currency Picker Modal ────────────────────────────────────────────── */}
      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowCurrencyPicker(false); setCurrencySearch(''); }}
      >
        <View style={styles.overlay}>
          {/* Backdrop — siblings with sheet, so it never overlaps it */}
          <Pressable style={styles.backdrop} onPress={() => { setShowCurrencyPicker(false); setCurrencySearch(''); }} />
          <View style={[styles.sheet, styles.pickerSheet]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Manage Currencies</Text>
            <Text style={styles.sheetSubtitle}>Choose currencies shown in rate cards & converter</Text>

            <TextInput
              style={styles.pickerSearch}
              value={currencySearch}
              onChangeText={setCurrencySearch}
              placeholder="Search by code or name…"
              placeholderTextColor="#bbb"
              clearButtonMode="while-editing"
            />

            {/* Selected chips */}
            {selectedCurrencies.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedChipScroll} contentContainerStyle={styles.selectedChipContent}>
                {selectedCurrencies.map(cc => (
                  <TouchableOpacity key={cc} style={styles.selectedChip} onPress={() => toggleCurrency(cc)}>
                    <Text style={styles.selectedChipFlag}>{CURRENCY_FLAGS[cc] ?? '🏳️'}</Text>
                    <Text style={styles.selectedChipText}>{cc}</Text>
                    <Text style={styles.selectedChipRemove}>✕</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <FlatList
              data={filteredRates}
              keyExtractor={item => item.cc}
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selectedCurrencies.includes(item.cc);
                return (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => toggleCurrency(item.cc)}>
                    <Text style={styles.pickerFlag}>{CURRENCY_FLAGS[item.cc] ?? '🏳️'}</Text>
                    <View style={styles.pickerInfo}>
                      <Text style={styles.pickerCode}>{item.cc}</Text>
                      <Text style={styles.pickerName} numberOfLines={1}>{item.txt}</Text>
                    </View>
                    <Text style={styles.pickerRate}>₴{item.rate.toFixed(2)}</Text>
                    <View style={[styles.pickerCheck, isSelected && styles.pickerCheckActive]}>
                      {isSelected && <Text style={styles.pickerCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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

  // Currency picker
  pickerSheet: { height: '85%', paddingHorizontal: 20 },
  pickerSearch: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#1a1a1a', marginBottom: 12,
  },
  selectedChipScroll: { marginBottom: 12 },
  selectedChipContent: { gap: 8 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BRAND + '15', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: BRAND + '30',
  },
  selectedChipFlag: { fontSize: 14 },
  selectedChipText: { fontSize: 13, fontWeight: '700', color: BRAND },
  selectedChipRemove: { fontSize: 10, color: BRAND, marginLeft: 2, fontWeight: '700' },
  pickerList: { flex: 1 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  pickerFlag: { fontSize: 22 },
  pickerInfo: { flex: 1 },
  pickerCode: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  pickerName: { fontSize: 11, color: '#aaa', marginTop: 1 },
  pickerRate: { fontSize: 13, fontWeight: '600', color: '#888', marginRight: 4 },
  pickerCheck: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerCheckActive: { backgroundColor: BRAND, borderColor: BRAND },
  pickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
