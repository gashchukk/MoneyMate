// app/(tabs)/accounts/index.tsx
import { router } from "expo-router";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import AccountsListView from "@/components/accounts/AccountListView";
import AccountModal from "@/components/accounts/AccountModal";

import { DEFAULT_ACCOUNTS, mockTransactions } from "@/constants/constrants";
import { useAccounts } from "@/context/AccountsContext";
import { Account } from "@/types/types";
import { calculateAccountBalance } from "@/utils/utils";

export default function AccountsScreen() {
  const { accounts, setAccounts } = useAccounts(); 



  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const EMPTY_ACCOUNT: Account = {
    id: "",
    label: "",
    icon: "wallet-outline",
    color: "#3b82f6",
    balance: 0,
    currency: "UAH",
  };
  const [newAccount, setNewAccount] = useState<Account>(EMPTY_ACCOUNT);

  // Map accounts to show updated balances for non-Mono accounts
  const accountsWithBalances = accounts.map(acc =>
    acc.isMono ? acc : { ...acc, balance: calculateAccountBalance(acc.id, mockTransactions) }
  );

  // Open Add Account modal
  const openAddModal = () => {
    setEditingAccount(null);
    setNewAccount(EMPTY_ACCOUNT);
    setModalVisible(true);
  };

  // Save new or edited account
  const saveAccount = () => {
    if (!editingAccount && !newAccount.label.trim()) {
      alert("Please enter an account name");
      return;
    }

    setAccounts((prev: Account[]) => {
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
    setEditingAccount(null);
    setNewAccount(EMPTY_ACCOUNT);
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <AccountsListView
        accounts={accountsWithBalances}
        onAddAccount={openAddModal}
        onSelectAccount={id => router.push(`/accounts/${id}`)}
        onLinkMono={() => null} // linking removed, handled in settings
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
