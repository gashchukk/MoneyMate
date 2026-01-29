// context/SettingsContext.tsx
import React, { createContext, useContext, useState, ReactNode } from "react";

type SettingsContextType = {
  currency: string;
  setCurrency: (val: string) => void;
  language: string;
  setLanguage: (val: string) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState("UAH");
  const [language, setLanguage] = useState("en");

  return (
    <SettingsContext.Provider value={{ currency, setCurrency, language, setLanguage }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
}
