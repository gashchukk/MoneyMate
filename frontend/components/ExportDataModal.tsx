import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { useTranslation } from 'react-i18next';
import { BRAND } from '@/constants/brand';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import type { Account, Transaction } from '@/types';
import {
  buildExportRows,
  filterTransactionsByRange,
  shareTransactionExport,
  type ExportDateRange,
  type ExportFormat,
  type ExportPeriod,
} from '@/utils/exportTransactionData';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type RangeMode = 'preset' | 'custom';

const PRESETS: { key: ExportPeriod; labelKey: string }[] = [
  { key: '7d', labelKey: 'export_period_7d' },
  { key: '30d', labelKey: 'export_period_30d' },
  { key: '3m', labelKey: 'export_period_3m' },
  { key: '6m', labelKey: 'export_period_6m' },
  { key: '1y', labelKey: 'export_period_1y' },
  { key: 'all', labelKey: 'export_period_all' },
];

export default function ExportDataModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { language } = useAppSettings();
  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [rangeMode, setRangeMode] = useState<RangeMode>('preset');
  const [period, setPeriod] = useState<ExportPeriod>('30d');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [toDate, setToDate] = useState(() => new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setExporting(false);
      setError(null);
      setShowFromPicker(false);
      setShowToPicker(false);
    }
  }, [visible]);

  const dateRange: ExportDateRange = useMemo(() => {
    if (rangeMode === 'preset') return { mode: 'preset', period };
    return { mode: 'custom', from: fromDate, to: toDate };
  }, [rangeMode, period, fromDate, toDate]);

  const customRangeInvalid = rangeMode === 'custom' && fromDate > toDate;

  const handleExport = async () => {
    if (customRangeInvalid) {
      setError(t('export_invalid_range'));
      return;
    }

    setExporting(true);
    setError(null);
    try {
      const [transactions, accounts] = await Promise.all([
        apiFetch('/transactions') as Promise<Transaction[]>,
        apiFetch('/accounts') as Promise<Account[]>,
      ]);
      const filtered = filterTransactionsByRange(transactions, dateRange);
      const rows = buildExportRows(filtered, accounts, language, t);
      await shareTransactionExport(rows, format, t);
      onClose();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      setError(e?.message ?? t('export_failed'));
    } finally {
      setExporting(false);
    }
  };

  const fmtDate = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('export_data')}</Text>
          <Text style={styles.subtitle}>{t('export_data_sub')}</Text>

          <Text style={styles.label}>{t('export_format')}</Text>
          <View style={styles.chipRow}>
            {(['csv', 'xlsx'] as ExportFormat[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, format === f && styles.chipActive]}
                onPress={() => setFormat(f)}
              >
                <Text style={[styles.chipText, format === f && styles.chipTextActive]}>
                  {f === 'csv' ? t('export_format_csv') : t('export_format_excel')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('export_date_range')}</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, rangeMode === 'preset' && styles.chipActive]}
              onPress={() => setRangeMode('preset')}
            >
              <Text style={[styles.chipText, rangeMode === 'preset' && styles.chipTextActive]}>
                {t('export_presets')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, rangeMode === 'custom' && styles.chipActive]}
              onPress={() => setRangeMode('custom')}
            >
              <Text style={[styles.chipText, rangeMode === 'custom' && styles.chipTextActive]}>
                {t('custom')}
              </Text>
            </TouchableOpacity>
          </View>

          {rangeMode === 'preset' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
              {PRESETS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.presetChip, period === p.key && styles.chipActive]}
                  onPress={() => setPeriod(p.key)}
                >
                  <Text style={[styles.chipText, period === p.key && styles.chipTextActive]}>
                    {t(p.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.customRange}>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => { setShowToPicker(false); setShowFromPicker(v => !v); }}
              >
                <Text style={styles.dateBtnLabel}>{t('export_from')}</Text>
                <Text style={styles.dateBtnValue}>{fmtDate(fromDate)}</Text>
              </TouchableOpacity>
              <Text style={styles.dateSep}>–</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => { setShowFromPicker(false); setShowToPicker(v => !v); }}
              >
                <Text style={styles.dateBtnLabel}>{t('export_to')}</Text>
                <Text style={styles.dateBtnValue}>{fmtDate(toDate)}</Text>
              </TouchableOpacity>
            </View>
          )}

          {showFromPicker && (
            <AppDateTimePicker
              value={fromDate}
              mode="date"
              maximumDate={toDate}
              onChange={(_, selected) => {
                setShowFromPicker(false);
                if (selected) setFromDate(selected);
              }}
            />
          )}
          {showToPicker && (
            <AppDateTimePicker
              value={toDate}
              mode="date"
              minimumDate={fromDate}
              maximumDate={new Date()}
              onChange={(_, selected) => {
                setShowToPicker(false);
                if (selected) setToDate(selected);
              }}
            />
          )}

          {customRangeInvalid && (
            <Text style={styles.errorText}>{t('export_invalid_range')}</Text>
          )}
          {error && !customRangeInvalid && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <View style={styles.btns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={exporting}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportBtn, (exporting || customRangeInvalid) && { opacity: 0.65 }]}
              onPress={handleExport}
              disabled={exporting || customRangeInvalid}
            >
              {exporting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.exportBtnText}>{t('export_action')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 48,
    maxHeight: '90%',
  },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18 },
  label: {
    fontSize: 12, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#eee',
  },
  chipActive: { backgroundColor: '#fdf0f0', borderColor: BRAND },
  chipText: { fontSize: 14, fontWeight: '600', color: '#666' },
  chipTextActive: { color: BRAND },
  presetRow: { gap: 8, paddingBottom: 8, marginBottom: 8 },
  presetChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#eee',
  },
  customRange: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dateBtn: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: '#eee',
  },
  dateBtnLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', marginBottom: 4 },
  dateBtnValue: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  dateSep: { fontSize: 18, color: '#ccc', fontWeight: '300' },
  errorText: { fontSize: 13, color: '#c0392b', marginBottom: 8 },
  btns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#888' },
  exportBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: BRAND },
  exportBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
