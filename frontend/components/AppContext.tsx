import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import '../i18n'; 
import i18n from 'i18next';

export type Currency = string;
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
      if (l) {
        setLanguageState(l as Language);
        i18n.changeLanguage(l);
      }
    })();
  }, []);

  const setCurrency = async (c: Currency) => {
    setCurrencyState(c);
    await SecureStore.setItemAsync('system_currency', c);
  };

  const setLanguage = async (l: Language) => {
    setLanguageState(l);
    i18n.changeLanguage(l);
    await SecureStore.setItemAsync('system_language', l);
  };

  return (
    <AppContext.Provider value={{ currency, language, setCurrency, setLanguage }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppSettings = () => useContext(AppContext);


export const t = (key: string, _lang?: Language): string => {
  return i18n.t(key, { defaultValue: key });
};
