import type { TFunction } from 'i18next';
import type { Transaction } from '@/types';

// Stored category labels in DB are (currently) English strings.
// We keep them stable for grouping/filtering, but translate for display.
export const CATEGORY_I18N_KEYS: Record<string, string> = {
  'Food & Drink': 'cat_food_drink',
  Groceries: 'cat_groceries',
  Dining: 'cat_dining',
  Transport: 'cat_transport',
  Health: 'cat_health',
  Shopping: 'cat_shopping',
  Entertainment: 'cat_entertainment',
  Housing: 'cat_housing',
  Education: 'cat_education',
  Subscriptions: 'cat_subscriptions',

  Salary: 'cat_salary',
  Freelance: 'cat_freelance',
  Business: 'cat_business',
  Investment: 'cat_investment',
  Gift: 'cat_gift',
  Refund: 'cat_refund',

  Transfer: 'cat_transfer',
  Correction: 'cat_correction',
  Other: 'cat_other',
  Manual: 'cat_manual',
};

/** Translate a canonical category label (e.g. "Groceries" → "Продукти"). */
export function displayCategoryLabel(label: string | null | undefined, t: TFunction): string {
  if (!label) return '';
  const key = CATEGORY_I18N_KEYS[label];
  return key ? t(key) : label;
}

/**
 * Best display label for a transaction's category/MCC.
 * Priority:
 *   1. MCC label from mcc.json in the user's language (full 10k+ coverage)
 *   2. Canonical category translated via i18n keys
 *   3. Raw category string (custom categories)
 */
export function displayTxCategoryLabel(
  tx: Pick<Transaction, 'category' | 'mcc_label_en' | 'mcc_label_uk'>,
  language: string,
  t: TFunction,
): string {
  const mccLabel = language === 'uk' ? tx.mcc_label_uk : tx.mcc_label_en;
  if (mccLabel) return mccLabel;
  return displayCategoryLabel(tx.category, t) || tx.category || '';
}

