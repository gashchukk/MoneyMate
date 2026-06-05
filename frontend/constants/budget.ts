import * as SecureStore from 'expo-secure-store';
import { DEFAULT_EXPENSE_CATEGORIES } from '@/constants/brand';

export const BUDGET_STORE_KEY = 'category_budget_limits';
export const BUDGET_CATEGORIES_KEY = 'budget_categories_config';

export type BudgetCategoryDef = { label: string; icon: string; color: string };

export type BudgetCategoriesConfig = {
  /** Category labels the user wants on the budget page */
  visible: string[];
  /** User-created categories */
  custom: BudgetCategoryDef[];
};

export function defaultBudgetCategoriesConfig(): BudgetCategoriesConfig {
  return {
    visible: DEFAULT_EXPENSE_CATEGORIES.map(c => c.label),
    custom: [],
  };
}

/** monthKey (YYYY-MM) → category label → limit amount in system currency */
export type BudgetStore = Record<string, Record<string, number>>;

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function loadBudgetStore(): Promise<BudgetStore> {
  try {
    const raw = await SecureStore.getItemAsync(BUDGET_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveBudgetLimit(month: string, category: string, amount: number | null): Promise<BudgetStore> {
  const store = await loadBudgetStore();
  const monthLimits = { ...(store[month] ?? {}) };
  if (amount == null || amount <= 0) {
    delete monthLimits[category];
  } else {
    monthLimits[category] = amount;
  }
  const next: BudgetStore = { ...store, [month]: monthLimits };
  if (Object.keys(monthLimits).length === 0) {
    delete next[month];
  }
  await SecureStore.setItemAsync(BUDGET_STORE_KEY, JSON.stringify(next));
  return next;
}

export async function loadBudgetCategoriesConfig(): Promise<BudgetCategoriesConfig> {
  try {
    const raw = await SecureStore.getItemAsync(BUDGET_CATEGORIES_KEY);
    if (!raw) return defaultBudgetCategoriesConfig();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultBudgetCategoriesConfig();
    return {
      visible: Array.isArray(parsed.visible) ? parsed.visible : defaultBudgetCategoriesConfig().visible,
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    };
  } catch {
    return defaultBudgetCategoriesConfig();
  }
}

export async function saveBudgetCategoriesConfig(config: BudgetCategoriesConfig): Promise<BudgetCategoriesConfig> {
  await SecureStore.setItemAsync(BUDGET_CATEGORIES_KEY, JSON.stringify(config));
  return config;
}
