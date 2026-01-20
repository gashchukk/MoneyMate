import { useEffect, useState } from "react";
import { mockTransactions } from "../constants/constrants";
import { MonobankAccount, Transaction } from "../types/types";

const POLL_INTERVAL = 1000 * 60 * 60; // 1 hour

export function useMonoPolling(monoToken: string, monoAccounts: MonobankAccount[]) {
  const [transactions, setTransactions] = useState<Record<string, Transaction[]>>(mockTransactions);

  useEffect(() => {
    if (!monoToken || monoAccounts.length === 0) return;

    const fetchTransactions = async () => {
      const now = Math.floor(Date.now() / 1000); // current time in seconds
      const from = now - 3600; // last 1 hour
      for (const acc of monoAccounts) {
        try {
          const res = await fetch(`https://api.monobank.ua/personal/statement/${acc.id}/${from}/${now}`, {
            headers: { "X-Token": monoToken }
          });
          const data: Transaction[] = await res.json();

          // Convert amounts from kopiyky → UAH
          const formatted = data.map(tx => ({
            ...tx,
            amount: tx.amount / 100
          }));

          setTransactions(prev => ({
            ...prev,
            [acc.id]: [...(prev[acc.id] || []), ...formatted]
          }));
        } catch (err) {
          console.error("Error fetching Mono transactions:", err);
        }
      }
    };

    // Initial fetch
    fetchTransactions();

    // Poll every hour
    const interval = setInterval(fetchTransactions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [monoToken, monoAccounts]);

  return transactions;
}
