import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from "react-native-safe-area-context";

import AccountModal from "@/components/accounts/AccountModal";
import AccountDetailView from "@/components/accounts/AccountDetailView";

import { DEFAULT_ACCOUNTS, mockTransactions } from "@/constants/constrants";
import { Account } from "@/types/types";
import { calculateAccountBalance, getAccountTransactions } from "@/utils/utils";
import { useAccounts } from '@/context/AccountsContext';
export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams();
  const accountId = Array.isArray(id) ? id[0] : id;

  const { accounts, setAccounts } = useAccounts();

  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const [newAccount, setNewAccount] = useState<Account>({
    id: "",
    label: "",
    icon: "wallet-outline",
    color: "#3b82f6",
    balance: 0,
    currency: "UAH",
  });

  const account = accounts.find(a => a.id === accountId);
  if (!account) {
    return null; // or some error screen
  }

  // const balance = account.isMono ? account.balance : calculateAccountBalance(accountId, mockTransactions);
  const balance = account.balance;
  const transactions = getAccountTransactions(accountId, mockTransactions);

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
    setNewAccount({
      id: "",
      label: "",
      icon: "wallet-outline",
      color: "#3b82f6",
      balance: 0,
      currency: "UAH",
    });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <AccountDetailView
        account={account}
        balance={balance}
        transactions={transactions}
        onBack={() => router.back()}
        onEdit={acc => {
          setEditingAccount(acc);
          setNewAccount(acc);
          setModalVisible(true);
        }}
        onDelete={accountId => {
          setAccounts(prev => prev.filter(a => a.id !== accountId));
          router.back()
        }}
      />
      <AccountModal
        visible={modalVisible}
        editingAccount={editingAccount}
        newAccount={newAccount}
        onClose={() => setModalVisible(false)}
        onSave={saveAccount}
        onUpdateAccount={updates => setNewAccount(prev => ({ ...prev, ...updates }))}
      />
    </SafeAreaView>
  );
}