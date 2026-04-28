export const BRAND = '#8B1A1A';
export const BRAND_LIGHT = '#fdf0f0';
export const BRAND_MID = '#e8c5c5';

export const CURRENCY_SYMBOLS: Record<number, string> = {
  980: '₴',
  840: '$',
  978: '€',
  826: '£',
};

export const CURRENCY_NAMES: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
};

export const currencySymbol = (code: number): string =>
  CURRENCY_SYMBOLS[code] ?? '?';

export const currencyName = (code: number): string =>
  CURRENCY_NAMES[code] ?? String(code);

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink': '#e67e22',
  Groceries: '#27ae60',
  Transport: '#2980b9',
  Health: '#e91e63',
  Shopping: '#9b59b6',
  Entertainment: '#f39c12',
  Housing: '#16a085',
  Salary: '#2ecc71',
  Transfer: '#95a5a6',
  Other: '#7f8c8d',
};

export const DEFAULT_EXPENSE_CATEGORIES: { label: string; icon: string; color: string }[] = [
  { label: 'Food & Drink',   icon: '🍔', color: '#e67e22' },
  { label: 'Groceries',      icon: '🛒', color: '#27ae60' },
  { label: 'Transport',      icon: '🚌', color: '#2980b9' },
  { label: 'Health',         icon: '💊', color: '#e91e63' },
  { label: 'Shopping',       icon: '🛍️', color: '#9b59b6' },
  { label: 'Entertainment',  icon: '🎬', color: '#f39c12' },
  { label: 'Housing',        icon: '🏠', color: '#16a085' },
  { label: 'Education',      icon: '📚', color: '#8e44ad' },
  { label: 'Subscriptions',  icon: '📱', color: '#2c3e50' },
  { label: 'Other',          icon: '💳', color: '#7f8c8d' },
];

export const DEFAULT_INCOME_CATEGORIES: { label: string; icon: string; color: string }[] = [
  { label: 'Salary',         icon: '💰', color: '#27ae60' },
  { label: 'Freelance',      icon: '💻', color: '#2980b9' },
  { label: 'Business',       icon: '🏢', color: '#8e44ad' },
  { label: 'Investment',     icon: '📈', color: '#16a085' },
  { label: 'Gift',           icon: '🎁', color: '#e91e63' },
  { label: 'Refund',         icon: '↩️', color: '#f39c12' },
  { label: 'Other',          icon: '💳', color: '#7f8c8d' },
];

export const DEFAULT_CATEGORIES = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES.filter(c => !DEFAULT_EXPENSE_CATEGORIES.find(e => e.label === c.label)),
  { label: 'Transfer', icon: '↔️', color: '#2980b9' },
];
