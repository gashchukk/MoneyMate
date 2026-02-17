import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Currency = 'USD' | 'EUR' | 'UAH';
export type Language = 'en' | 'uk';

interface AppSettings {
  currency: Currency;
  language: Language;
  setCurrency: (c: Currency) => void;
  setLanguage: (l: Language) => void;
}

const AppContext = createContext<AppSettings>({
  currency: 'UAH',
  language: 'en',
  setCurrency: () => {},
  setLanguage: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('UAH');
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    (async () => {
      const c = await SecureStore.getItemAsync('system_currency');
      const l = await SecureStore.getItemAsync('system_language');
      if (c) setCurrencyState(c as Currency);
      if (l) setLanguageState(l as Language);
    })();
  }, []);

  const setCurrency = async (c: Currency) => {
    setCurrencyState(c);
    await SecureStore.setItemAsync('system_currency', c);
  };

  const setLanguage = async (l: Language) => {
    setLanguageState(l);
    await SecureStore.setItemAsync('system_language', l);
  };

  return (
    <AppContext.Provider value={{ currency, language, setCurrency, setLanguage }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppSettings = () => useContext(AppContext);

// ── i18n ──────────────────────────────────────────────────────────────────────
export const t = (key: string, lang: Language): string => {
  const translations: Record<string, Record<Language, string>> = {
    transactions: { en: 'Transactions', uk: 'Транзакції' },
    accounts: { en: 'Accounts', uk: 'Рахунки' },
    settings: { en: 'Settings', uk: 'Налаштування' },
    add_transaction: { en: 'Add Transaction', uk: 'Додати транзакцію' },
    description: { en: 'Description', uk: 'Опис' },
    amount: { en: 'Amount', uk: 'Сума' },
    account: { en: 'Account', uk: 'Рахунок' },
    cancel: { en: 'Cancel', uk: 'Скасувати' },
    save: { en: 'Save', uk: 'Зберегти' },
    total_balance: { en: 'Total Balance', uk: 'Загальний баланс' },
    no_transactions: { en: 'No transactions this month', uk: 'Немає транзакцій цього місяця' },
    system_currency: { en: 'System Currency', uk: 'Системна валюта' },
    language: { en: 'Language', uk: 'Мова' },
    monobank: { en: 'Monobank', uk: 'Монобанк' },
    link_monobank: { en: 'Link Monobank Account', uk: 'Підключити Монобанк' },
    sync_mono: { en: 'Sync Transactions', uk: 'Синхронізувати транзакції' },
    logout: { en: 'Log Out', uk: 'Вийти' },
    english: { en: 'English', uk: 'Англійська' },
    ukrainian: { en: 'Ukrainian', uk: 'Українська' },
    currency_rates: { en: 'Currency Rates', uk: 'Курси валют' },
    approx: { en: '≈', uk: '≈' },
  };
  return translations[key]?.[lang] ?? key;
};
