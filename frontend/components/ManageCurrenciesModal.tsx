import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ScrollView, TouchableOpacity, FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { BRAND } from '@/constants/brand';
import { CURRENCY_FLAGS, type NBURate } from '@/constants/displayCurrencies';

type Props = {
  visible: boolean;
  onClose: () => void;
  rates: NBURate[];
  selectedCurrencies: string[];
  onToggle: (cc: string) => void;
};

export default function ManageCurrenciesModal({
  visible,
  onClose,
  rates,
  selectedCurrencies,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const [currencySearch, setCurrencySearch] = useState('');

  useEffect(() => {
    if (!visible) setCurrencySearch('');
  }, [visible]);

  const filteredRates = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter(
      r =>
        r.cc.toLowerCase().includes(q) ||
        r.txt.toLowerCase().includes(q),
    );
  }, [rates, currencySearch]);

  const handleClose = () => {
    setCurrencySearch('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, styles.pickerSheet]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t('manage_currencies_title')}</Text>
          <Text style={styles.sheetSubtitle}>{t('manage_currencies_sub')}</Text>

          <TextInput
            style={styles.pickerSearch}
            value={currencySearch}
            onChangeText={setCurrencySearch}
            placeholder={t('search_currency_placeholder')}
            placeholderTextColor="#bbb"
            clearButtonMode="while-editing"
          />

          {selectedCurrencies.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.selectedChipScroll}
              contentContainerStyle={styles.selectedChipContent}
              alwaysBounceVertical={false}
            >
              {selectedCurrencies.map(cc => (
                <TouchableOpacity
                  key={cc}
                  style={[styles.selectedChip, { alignSelf: 'flex-start' }]}
                  onPress={() => onToggle(cc)}
                >
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
                <TouchableOpacity style={styles.pickerRow} onPress={() => onToggle(item.cc)}>
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
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
  },
  pickerSheet: { height: '85%', paddingHorizontal: 20 },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  sheetSubtitle: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  pickerSearch: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#1a1a1a', marginBottom: 12,
  },
  selectedChipScroll: { marginBottom: 12, flexGrow: 0 },
  selectedChipContent: { gap: 6, alignItems: 'center', flexDirection: 'row' },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: BRAND + '15', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 4,
    borderWidth: 1, borderColor: BRAND + '30',
  },
  selectedChipFlag: { fontSize: 11 },
  selectedChipText: { fontSize: 12, fontWeight: '700', color: BRAND },
  selectedChipRemove: { fontSize: 9, color: BRAND, fontWeight: '700' },
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
