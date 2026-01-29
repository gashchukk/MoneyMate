import { router } from 'expo-router';
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import AccountModal from "@/components/accounts/AccountModal";
import AccountsListView from "@/components/accounts/AccountListView";
import MonobankModal from "@/components/accounts/MonobankModal";

import { DEFAULT_ACCOUNTS, mockTransactions } from "@/constants/constrants";
import { getMonoToken } from "@/storage/monobankToken";
import { Account, MonobankAccount } from "@/types/types";
import { calculateAccountBalance } from "@/utils/utils";
import { useEffect } from "react";

export default function AccountsScreen() {
    const [lastMonoFetch, setLastMonoFetch] = useState<number | null>(null);

    useEffect(() => {
      (async () => {
        const savedToken = await getMonoToken();
        if (!savedToken) return;

        setMonoToken(savedToken);

        if (lastMonoFetch && Date.now() - lastMonoFetch < 60_000) {
          console.log("Skipping Monobank fetch: 60s not elapsed");
          return;
        }

        try {
          const response = await fetch("https://api.monobank.ua/personal/client-info", {
            method: "GET",
            headers: { "X-Token": savedToken },
          });

          if (!response.ok) throw new Error("Failed to fetch Monobank accounts");

          const data = await response.json();

          if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
            const formattedAccounts: Account[] = data.accounts.map((acc: MonobankAccount) => ({
              id: acc.id.toString(),           // string ID
              label: `Monobank ${acc.type}`,
              icon: "wallet-outline",
              color: "#10b981",
              balance: acc.balance / 100,      // kopiyky → UAH
              currency: acc.cashbackType || "UAH",
              isMono: true,
            }));

            setAccounts(prev => {
              const existingIds = new Set(prev.map(acc => acc.id));
              const newAccounts = formattedAccounts.filter(acc => !existingIds.has(acc.id));
              return [...prev, ...newAccounts];
            });

            setMonoLinked(true);
          } else {
            setMonoLinked(false);
          }

          setLastMonoFetch(Date.now());
        } catch (err) {
          console.log("Monobank auto-connect failed:", err);
          setMonoLinked(false);
        }
      })();
    }, []);




  const EMPTY_ACCOUNT: Account = {
    id: "",
    label: "",
    icon: "wallet-outline",
    color: "#3b82f6",
    balance: 0,
    currency: "UAH",
  };

  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_ACCOUNT);
  const [monoLinked, setMonoLinked] = useState(false);
  const [monoModalVisible, setMonoModalVisible] = useState(false);
  const [monoToken, setMonoToken] = useState("");

  const accountsWithBalances = accounts.map(acc => 
    acc.isMono 
      ? acc 
      : { ...acc, balance: calculateAccountBalance(acc.id, mockTransactions) }
  );

  const totalBalance = accountsWithBalances.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);

  // Modal handlers
  const openAddModal = () => {
    setEditingAccount(null);
    setNewAccount(EMPTY_ACCOUNT);
    setModalVisible(true);
  };

  const handleMonoConnect = (monoAccounts: MonobankAccount[]) => {
    const formattedAccounts: Account[] = monoAccounts.map(acc => ({
      id: acc.id.toString(),
      label: `Monobank ${acc.type}`,
      icon: "wallet-outline",
      color: "#10b981",
      balance: acc.balance / 100,          // convert kopiyky → UAH
      currency: acc.cashbackType || "UAH",
      isMono: true,
    }));

    setAccounts(prev => [...prev, ...formattedAccounts]);
    setMonoLinked(true);
    setMonoModalVisible(false);
  };

  const saveAccount = () => {
    if (!editingAccount && !newAccount.label.trim()) {
      alert("Please enter an account name");
      return;
    }
    setAccounts(prev => {
      if (editingAccount) {
        return prev.map(acc =>
          acc.id === editingAccount.id
            ? { ...acc, ...newAccount, label: newAccount.label.trim() || acc.label }
            : acc
        );
      } else {
        return [...prev, { ...newAccount, id: Date.now().toString(), label: newAccount.label.trim() }];
      }
    });

    // Reset modal state
    setModalVisible(false);
    setEditingAccount(null);
    setNewAccount(EMPTY_ACCOUNT);
  };

  // Default view: accounts list
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <AccountsListView
        accounts={accountsWithBalances}
        totalBalance={totalBalance}
        monoLinked={monoLinked}
        onAddAccount={openAddModal}
        onSelectAccount={(id) => router.push(`/accounts/${id}`)}
        onLinkMono={() => setMonoModalVisible(true)}
      />

      <AccountModal
        visible={modalVisible}
        editingAccount={editingAccount}
        newAccount={newAccount}
        onClose={() => setModalVisible(false)}
        onSave={saveAccount}
        onUpdateAccount={updates => setNewAccount(prev => ({ ...prev, ...updates }))}
      />

      <MonobankModal
        visible={monoModalVisible}
        monoToken={monoToken}
        onClose={() => setMonoModalVisible(false)}
        onConnect={handleMonoConnect}
        onTokenChange={setMonoToken}
      />
    </SafeAreaView>
  );
}
