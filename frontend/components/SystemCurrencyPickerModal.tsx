import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  TouchableOpacity, FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { BRAND } from '@/constants/brand';
import { CURRENCY_FLAGS, type NBURate } from '@/constants/displayCurrencies';

type Props = {
  visible: boolean;
  onClose: () => void;
  rates: NBURate[];
  selectedCode: string;
  onSelect: (cc: string) => void;
};

export default function SystemCurrencyPickerModal({
  visible,
  onClose,
  rates,
  selectedCode,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  const rows = useMemo(() => {
    const uah: NBURate = {
      cc: 'UAH',
      rate: 1,
      txt: t('ukrainian_hryvnia'),
    };
    const rest = rates.filter(r => r.cc !== 'UAH');
    return [uah, ...rest];
  }, [rates, t]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r => r.cc.toLowerCase().includes(q) || r.txt.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  const pick = (cc: string) => {
    onSelect(cc);
    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, styles.pickerSheet]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t('choose_system_currency_title')}</Text>
          <Text style={styles.sheetSubtitle}>{t('choose_system_currency_sub')}</Text>

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder={t('search_currency_placeholder')}
            placeholderTextColor="#bbb"
            clearButtonMode="while-editing"
          />

          <FlatList
            data={filtered}
            keyExtractor={item => item.cc}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = selectedCode === item.cc;
              const rateLabel = item.cc === 'UAH' ? '1.00 ₴' : `₴${item.rate.toFixed(2)}`;
              return (
                <TouchableOpacity style={styles.row} onPress={() => pick(item.cc)} activeOpacity={0.7}>
                  <Text style={styles.flag}>{CURRENCY_FLAGS[item.cc] ?? '🏳️'}</Text>
                  <View style={styles.info}>
                    <Text style={styles.code}>{item.cc}</Text>
                    <Text style={styles.name} numberOfLines={1}>{item.txt}</Text>
                  </View>
                  <Text style={styles.rate}>{rateLabel}</Text>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
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
  sheetSubtitle: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  search: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#1a1a1a', marginBottom: 12,
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  flag: { fontSize: 22 },
  info: { flex: 1 },
  code: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  name: { fontSize: 11, color: '#aaa', marginTop: 1 },
  rate: { fontSize: 13, fontWeight: '600', color: '#888', marginRight: 4 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#ddd',
    justifyContent: 'center', alignItems: 'center',
  },
  radioActive: { borderColor: BRAND },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
});
