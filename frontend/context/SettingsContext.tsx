// context/SettingsContext.tsx
import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { getMonoToken } from "@/storage/monobankToken";
import { useAccounts } from "./AccountsContext";
import { Account, MonobankAccount } from "@/types/types";

type SettingsContextType = {
  currency: string;
  setCurrency: (c: string) => void;
  language: string;
  setLanguage: (l: string) => void;
  monoLinked: boolean;
  setMonoLinked: (linked: boolean) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrency] = useState("UAH");
  const [language, setLanguage] = useState("en");
  const [monoLinked, setMonoLinked] = useState(false);

  const { accounts, setAccounts } = useAccounts();

  // Auto-link Monobank on app start
  useEffect(() => {
    (async () => {
      const token = await getMonoToken();
      if (token) {
        setMonoLinked(true);

        // fetch accounts if token exists
        try {
          const response = await fetch("https://api.monobank.ua/personal/client-info", {
            method: "GET",
            headers: { "X-Token": token },
          });
          if (!response.ok) throw new Error("Failed to fetch Monobank accounts");

          const data = await response.json();
          if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
            const formattedAccounts: Account[] = data.accounts.map((acc: MonobankAccount) => ({
              id: acc.id.toString(),
              label: `Monobank ${acc.type}`,
              icon: "wallet-outline",
              color: "#10b981",
              balance: acc.balance / 100,
              currency: acc.cashbackType || "UAH",
              isMono: true,
            }));

            // merge with existing accounts
            setAccounts(prev => {
              const existingIds = new Set(prev.map(acc => acc.id));
              const newAccounts = formattedAccounts.filter(acc => !existingIds.has(acc.id));
              return [...prev, ...newAccounts];
            });
          }
        } catch (err) {
          console.log("Monobank auto-fetch failed:", err);
          setMonoLinked(false);
        }
      }
    })();
  }, []);

  return (
    <SettingsContext.Provider value={{ currency, setCurrency, language, setLanguage, monoLinked, setMonoLinked }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
};
