import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiFetch, SessionExpiredError } from '@/constants/api';
import { useAppSettings } from '@/components/AppContext';
import type { Transaction } from '@/types';
import { BRAND, DEFAULT_EXPENSE_CATEGORIES } from '@/constants/brand';
import { useNbuRates } from '@/hooks/useNbuRates';
import { convertAmountToSystem } from '@/utils/convertToSystemCurrency';
import { systemCurrencySymbol } from '@/constants/displayCurrencies';
import { displayCategoryLabel } from '@/utils/categoryI18n';
import {
  monthKey,
  loadBudgetStore,
  saveBudgetLimit,
  loadBudgetCategoriesConfig,
  saveBudgetCategoriesConfig,
  type BudgetStore,
  type BudgetCategoriesConfig,
  type BudgetCategoryDef,
} from '@/constants/budget';

function buildCategoryMeta(config: BudgetCategoriesConfig): Record<string, { icon: string; color: string }> {
  const map = Object.fromEntries(
    DEFAULT_EXPENSE_CATEGORIES.map(c => [c.label, { icon: c.icon, color: c.color }]),
  );
  config.custom.forEach(c => { map[c.label] = { icon: c.icon, color: c.color }; });
  return map;
}

function getCategoryMeta(cat: string, metaMap: Record<string, { icon: string; color: string }>) {
  return metaMap[cat] ?? { icon: '🏷️', color: '#888' };
}

function txAbsInSystem(tx: Transaction, currency: string, allRates: Record<string, number>): number {
  const c = convertAmountToSystem(Math.abs(tx.amount), tx.currency_code, currency, allRates);
  return c ?? Math.abs(tx.amount);
}

function isInternal(tx: Transaction) {
  return tx.category === 'Transfer' || tx.category === 'Correction';
}

type CategoryRow = {
  key: string;
  icon: string;
  color: string;
  spent: number;
  limit: number | null;
};

export default function BudgetScreen() {
  const { t } = useTranslation();
  const { language, currency } = useAppSettings();
  const { allRates } = useNbuRates();
  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetStore, setBudgetStore] = useState<BudgetStore>({});
  const [categoriesConfig, setCategoriesConfig] = useState<BudgetCategoriesConfig>({ visible: [], custom: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [navDate, setNavDate] = useState(() => new Date());

  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const [showManage, setShowManage] = useState(false);
  const [draftVisible, setDraftVisible] = useState<Set<string>>(new Set());
  const [draftCustom, setDraftCustom] = useState<BudgetCategoryDef[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const currentMonth = monthKey(navDate);
  const sym = systemCurrencySymbol(currency);
  const categoryMetaMap = useMemo(() => buildCategoryMeta(categoriesConfig), [categoriesConfig]);

  const fetchAll = useCallback(async () => {
    try {
      const [txs, store, config] = await Promise.all([
        apiFetch('/transactions'),
        loadBudgetStore(),
        loadBudgetCategoriesConfig(),
      ]);
      setTransactions(txs);
      setBudgetStore(store);
      setCategoriesConfig(config);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const monthExpenses = useMemo(() => {
    const y = navDate.getFullYear();
    const m = navDate.getMonth();
    return transactions.filter(tx => {
      const d = new Date(tx.time < 1e10 ? tx.time * 1000 : tx.time);
      return d.getFullYear() === y && d.getMonth() === m && tx.amount < 0 && !isInternal(tx);
    });
  }, [transactions, navDate]);

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthExpenses.forEach(tx => {
      const key = tx.category ?? 'Other';
      map[key] = (map[key] ?? 0) + txAbsInSystem(tx, currency, allRates);
    });
    return map;
  }, [monthExpenses, currency, allRates]);

  const monthLimits = budgetStore[currentMonth] ?? {};

  const categoryRows = useMemo((): CategoryRow[] => {
    return categoriesConfig.visible
      .map(key => {
        const meta = getCategoryMeta(key, categoryMetaMap);
        return {
          key,
          icon: meta.icon,
          color: meta.color,
          spent: spentByCategory[key] ?? 0,
          limit: monthLimits[key] ?? null,
        };
      })
      .sort((a, b) => {
        const aHas = a.limit != null ? 1 : 0;
        const bHas = b.limit != null ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return b.spent - a.spent;
      });
  }, [categoriesConfig.visible, categoryMetaMap, spentByCategory, monthLimits]);

  const totalSpent = useMemo(
    () => categoryRows.reduce((s, r) => s + r.spent, 0),
    [categoryRows],
  );
  const totalBudget = useMemo(
    () => categoryRows.reduce((s, r) => s + (r.limit ?? 0), 0),
    [categoryRows],
  );
  const categoriesWithLimits = categoryRows.filter(r => r.limit != null).length;
  const overBudgetCount = categoryRows.filter(r => r.limit != null && r.spent > r.limit!).length;

  const openManage = () => {
    setDraftVisible(new Set(categoriesConfig.visible));
    setDraftCustom([...categoriesConfig.custom]);
    setShowNewCategory(false);
    setNewCategoryName('');
    setShowManage(true);
  };

  const toggleDraftVisible = (label: string) => {
    setDraftVisible(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const allDraftLabels = useMemo(() => {
    const customLabels = new Set(draftCustom.map(c => c.label));
    const defaults = DEFAULT_EXPENSE_CATEGORIES.filter(c => !customLabels.has(c.label));
    return [...defaults.map(c => c.label), ...draftCustom.map(c => c.label)];
  }, [draftCustom]);

  const handleAddCustomCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const exists = allDraftLabels.some(l => l.toLowerCase() === name.toLowerCase());
    if (exists) {
      Alert.alert(t('already_exists'), t('category_already_exists'));
      return;
    }
    const newCat: BudgetCategoryDef = { label: name, icon: '🏷️', color: '#888' };
    setDraftCustom(prev => [...prev, newCat]);
    setDraftVisible(prev => new Set([...prev, name]));
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const handleRemoveCustom = (label: string) => {
    Alert.alert(
      t('remove_custom_category'),
      t('remove_custom_category_confirm', { name: label }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            setDraftCustom(prev => prev.filter(c => c.label !== label));
            setDraftVisible(prev => {
              const next = new Set(prev);
              next.delete(label);
              return next;
            });
          },
        },
      ],
    );
  };

  const handleSaveCategories = async () => {
    const config: BudgetCategoriesConfig = {
      visible: allDraftLabels.filter(l => draftVisible.has(l)),
      custom: draftCustom,
    };
    const saved = await saveBudgetCategoriesConfig(config);
    setCategoriesConfig(saved);
    setShowManage(false);
  };

  const navigateMonth = (dir: -1 | 1) => {
    setNavDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const goToToday = () => setNavDate(new Date());

  const openEdit = (key: string) => {
    const limit = monthLimits[key];
    setEditCategory(key);
    setEditAmount(limit != null ? String(limit) : '');
  };

  const handleSaveLimit = async () => {
    if (!editCategory) return;
    const parsed = parseFloat(editAmount);
    if (editAmount && (isNaN(parsed) || parsed < 0)) {
      Alert.alert(t('invalid_amount'), t('please_enter_positive_number'));
      return;
    }
    setSaving(true);
    try {
      const next = await saveBudgetLimit(
        currentMonth,
        editCategory,
        editAmount.trim() === '' ? null : parsed,
      );
      setBudgetStore(next);
      setEditCategory(null);
      setEditAmount('');
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = navDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const isCurrentMonth = monthKey(new Date()) === currentMonth;

  const renderCategoryChip = (cat: BudgetCategoryDef, isCustom: boolean) => {
    const selected = draftVisible.has(cat.label);
    return (
      <TouchableOpacity
        key={cat.label}
        style={[styles.pickChip, selected && { backgroundColor: cat.color, borderColor: cat.color }]}
        onPress={() => toggleDraftVisible(cat.label)}
        onLongPress={isCustom ? () => handleRemoveCustom(cat.label) : undefined}
      >
        <Text style={styles.pickChipIcon}>{cat.icon}</Text>
        <Text style={[styles.pickChipText, selected && { color: '#fff' }]}>
          {displayCategoryLabel(cat.label, t)}
        </Text>
        {selected && <Text style={styles.pickCheck}>✓</Text>}
      </TouchableOpacity>
    );
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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.backBtn}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('budget')}</Text>
            <Text style={styles.headerSub}>{t('budget_subtitle')}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.monthArrow}>
            <Text style={styles.monthArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.monthArrow}>
            <Text style={styles.monthArrowText}>›</Text>
          </TouchableOpacity>
          {!isCurrentMonth && (
            <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
              <Text style={styles.todayBtnText}>{t('today')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{t('total_budget')}</Text>
              <Text style={styles.summaryValue}>
                {totalBudget > 0 ? `${sym}${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{t('total_spent')}</Text>
              <Text style={[styles.summaryValue, styles.spentValue]}>
                {sym}{totalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{t('remaining')}</Text>
              <Text style={[styles.summaryValue, totalBudget - totalSpent >= 0 ? styles.positive : styles.negative]}>
                {totalBudget > 0
                  ? `${totalBudget - totalSpent >= 0 ? '' : '−'}${sym}${Math.abs(totalBudget - totalSpent).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                  : '—'}
              </Text>
            </View>
          </View>
          {categoriesWithLimits > 0 && overBudgetCount > 0 && (
            <Text style={styles.overBudgetHint}>
              {t('over_budget_count', { count: overBudgetCount })}
            </Text>
          )}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t('category_budgets')}</Text>
          <TouchableOpacity style={styles.manageBtn} onPress={openManage}>
            <Text style={styles.manageBtnText}>{t('manage_categories')}</Text>
          </TouchableOpacity>
        </View>

        {categoryRows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{t('no_categories_selected')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openManage}>
              <Text style={styles.emptyBtnText}>{t('manage_categories')}</Text>
            </TouchableOpacity>
          </View>
        ) : categoryRows.map(row => {
          const pct = row.limit ? Math.min((row.spent / row.limit) * 100, 100) : 0;
          const overPct = row.limit && row.spent > row.limit;
          const barColor = overPct ? '#c0392b' : pct >= 80 ? '#e67e22' : row.color;

          return (
            <TouchableOpacity
              key={row.key}
              style={styles.catCard}
              onPress={() => openEdit(row.key)}
              activeOpacity={0.75}
            >
              <View style={styles.catTop}>
                <Text style={styles.catIcon}>{row.icon}</Text>
                <View style={styles.catMid}>
                  <Text style={styles.catName}>{displayCategoryLabel(row.key, t)}</Text>
                  <Text style={styles.catAmounts}>
                    {row.limit != null
                      ? t('spent_of_budget', {
                          spent: `${sym}${row.spent.toFixed(0)}`,
                          budget: `${sym}${row.limit.toFixed(0)}`,
                        })
                      : t('spent_no_budget', { spent: `${sym}${row.spent.toFixed(0)}` })}
                  </Text>
                </View>
                <Text style={styles.editHint}>✏️</Text>
              </View>

              {row.limit != null ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${pct}%`, backgroundColor: barColor }]} />
                  {overPct && (
                    <View style={[styles.progressOver, { width: `${Math.min(((row.spent - row.limit!) / row.limit!) * 100, 30)}%` }]} />
                  )}
                </View>
              ) : (
                <TouchableOpacity style={styles.setLimitBtn} onPress={() => openEdit(row.key)}>
                  <Text style={styles.setLimitText}>{t('set_budget_limit')}</Text>
                </TouchableOpacity>
              )}

              {row.limit != null && overPct && (
                <Text style={styles.overLabel}>
                  {t('over_budget_by', { amount: `${sym}${(row.spent - row.limit).toFixed(0)}` })}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Manage categories modal ── */}
      <Modal visible={showManage} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowManage(false)}>
        <KeyboardAvoidingView style={styles.manageRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.manageHeader}>
            <TouchableOpacity onPress={() => setShowManage(false)}>
              <Text style={styles.manageCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.manageTitle}>{t('budget_manage_categories_title')}</Text>
            <TouchableOpacity onPress={handleSaveCategories}>
              <Text style={styles.manageSave}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.manageContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.manageSub}>{t('budget_manage_categories_sub')}</Text>

            <Text style={styles.manageSection}>{t('default_categories')}</Text>
            <View style={styles.pickGrid}>
              {DEFAULT_EXPENSE_CATEGORIES
                .filter(c => !draftCustom.some(d => d.label === c.label))
                .map(c => renderCategoryChip(c, false))}
            </View>

            {draftCustom.length > 0 && (
              <>
                <Text style={styles.manageSection}>{t('custom_categories')}</Text>
                <View style={styles.pickGrid}>
                  {draftCustom.map(c => renderCategoryChip(c, true))}
                </View>
              </>
            )}

            {!showNewCategory ? (
              <TouchableOpacity style={styles.addCatBtn} onPress={() => setShowNewCategory(true)}>
                <Text style={styles.addCatBtnText}>{t('add_custom_category')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.newCatRow}>
                <TextInput
                  style={styles.newCatInput}
                  placeholder={t('category_name_placeholder')}
                  placeholderTextColor="#bbb"
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAddCustomCategory}
                />
                <TouchableOpacity style={styles.newCatConfirm} onPress={handleAddCustomCategory}>
                  <Text style={styles.newCatConfirmText}>{t('add_label')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.newCatCancel} onPress={() => { setShowNewCategory(false); setNewCategoryName(''); }}>
                  <Text style={styles.newCatCancelText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit limit modal ── */}
      <Modal
        visible={editCategory != null}
        animationType="slide"
        transparent
        onRequestClose={() => { setEditCategory(null); setEditAmount(''); }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>
              {editCategory ? displayCategoryLabel(editCategory, t) : ''}
            </Text>
            <Text style={styles.modalSub}>{t('monthly_budget_limit_hint')}</Text>

            <Text style={styles.modalLabel}>{t('budget_limit')}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountSym}>{sym}</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#bbb"
                keyboardType="numeric"
                value={editAmount}
                onChangeText={setEditAmount}
                autoFocus
              />
              <Text style={styles.amountCurrency}>{currency}</Text>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setEditCategory(null); setEditAmount(''); }}
              >
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                onPress={handleSaveLimit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>

            {editCategory && monthLimits[editCategory] != null && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={async () => {
                  setSaving(true);
                  try {
                    const next = await saveBudgetLimit(currentMonth, editCategory!, null);
                    setBudgetStore(next);
                    setEditCategory(null);
                    setEditAmount('');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Text style={styles.removeBtnText}>{t('remove_budget_limit')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F6F6' },
  content: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F6F6F6' },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  backBtn: { fontSize: 16, fontWeight: '600', color: BRAND, minWidth: 60, marginTop: 6 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSpacer: { minWidth: 60 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5, textAlign: 'center' },
  headerSub: { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },

  monthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 4,
  },
  monthArrow: { padding: 10 },
  monthArrowText: { fontSize: 26, color: BRAND, fontWeight: '300' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', minWidth: 160, textAlign: 'center' },
  todayBtn: {
    marginLeft: 4, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: BRAND + '50',
  },
  todayBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },

  summaryCard: {
    marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#f0f0f0' },
  summaryLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  spentValue: { color: '#c0392b' },
  positive: { color: '#27ae60' },
  negative: { color: '#c0392b' },
  overBudgetHint: {
    fontSize: 12, color: '#c0392b', fontWeight: '600',
    textAlign: 'center', marginTop: 12,
  },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginTop: 20, marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#888', letterSpacing: 0.5, textTransform: 'uppercase',
  },
  manageBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: BRAND + '14', borderWidth: 1, borderColor: BRAND + '30',
  },
  manageBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },

  emptyBox: { marginHorizontal: 16, alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: '#aaa', textAlign: 'center', marginBottom: 12 },
  emptyBtn: {
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14, backgroundColor: BRAND,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  catCard: {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff',
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  catIcon: { fontSize: 22 },
  catMid: { flex: 1 },
  catName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  catAmounts: { fontSize: 12, color: '#888', marginTop: 2 },
  editHint: { fontSize: 14, opacity: 0.5 },

  progressTrack: {
    height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden',
    flexDirection: 'row',
  },
  progressBar: { height: '100%', borderRadius: 4 },
  progressOver: { height: '100%', backgroundColor: '#c0392b', opacity: 0.6 },

  setLimitBtn: {
    alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: BRAND + '40', borderStyle: 'dashed',
  },
  setLimitText: { fontSize: 12, fontWeight: '600', color: BRAND },
  overLabel: { fontSize: 11, color: '#c0392b', fontWeight: '600', marginTop: 6 },

  manageRoot: { flex: 1, backgroundColor: '#F6F6F6' },
  manageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  manageCancel: { fontSize: 16, fontWeight: '600', color: '#888', minWidth: 60 },
  manageTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  manageSave: { fontSize: 16, fontWeight: '700', color: BRAND, minWidth: 60, textAlign: 'right' },
  manageContent: { padding: 20, paddingBottom: 40 },
  manageSub: { fontSize: 14, color: '#888', lineHeight: 20, marginBottom: 20 },
  manageSection: {
    fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 10, marginTop: 8,
  },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20,
    backgroundColor: '#f4f4f4', borderWidth: 1.5, borderColor: 'transparent',
  },
  pickChipIcon: { fontSize: 14 },
  pickChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  pickCheck: { fontSize: 12, color: '#fff', fontWeight: '800', marginLeft: 2 },

  addCatBtn: {
    marginTop: 8, alignSelf: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#ddd', borderStyle: 'dashed',
  },
  addCatBtnText: { fontSize: 14, fontWeight: '600', color: '#888' },
  newCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  newCatInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a1a',
    borderWidth: 1.5, borderColor: '#eee',
  },
  newCatConfirm: { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  newCatConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  newCatCancel: { padding: 10 },
  newCatCancelText: { color: '#bbb', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  amountRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: BRAND + '40',
    borderRadius: 16, paddingHorizontal: 16, marginBottom: 20, backgroundColor: '#fafafa',
  },
  amountSym: { fontSize: 24, fontWeight: '700', color: BRAND, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', color: '#1a1a1a', paddingVertical: 12 },
  amountCurrency: { fontSize: 14, fontWeight: '700', color: '#888' },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#888' },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: BRAND },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  removeBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
  removeBtnText: { fontSize: 14, fontWeight: '600', color: '#c0392b' },
});
