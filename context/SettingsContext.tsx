import React, { createContext, useContext, useState, ReactNode } from "react";

type SettingsContextType = {
  currency: string;
  setCurrency: (val: string) => void;
  language: string;
  setLanguage: (val: string) => void;
  monoLinked: boolean;
  setMonoLinked: (val: boolean) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrency] = useState("UAH");
  const [language, setLanguage] = useState("en");
  const [monoLinked, setMonoLinked] = useState(false);

  return (
    <SettingsContext.Provider
      value={{ currency, setCurrency, language, setLanguage, monoLinked, setMonoLinked }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
};
