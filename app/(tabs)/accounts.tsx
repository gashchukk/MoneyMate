import { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AccountDetailView from "../../components/AccountDetailView";
import AccountsListView from "../../components/AccountListView";
import AccountModal from "../../components/AccountModal";
import MonobankModal from "../../components/MonobankModal";

import { DEFAULT_ACCOUNTS, mockTransactions } from "../../constants/constrants";
import { Account, MonobankAccount } from "../../types/types";
import { calculateAccountBalance, getAccountTransactions, getRate } from "../../utils/utils";


export default function AccountsScreen() {
  const EMPTY_ACCOUNT = {
    label: "",
    icon: "wallet-outline",
    color: "#3b82f6",
    balance: 0,
    currency: "UAH",
  };

  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_ACCOUNT);
  const [monoLinked, setMonoLinked] = useState(false);
  const [monoModalVisible, setMonoModalVisible] = useState(false);
  const [monoToken, setMonoToken] = useState("");

  const accountsWithBalances = accounts.map((account) => {
    if ((account as any).isMono) return account;
    return {
      ...account,
      balance: calculateAccountBalance(account.id, mockTransactions),
    };
  });
  const totalBalance = accountsWithBalances.reduce((sum, acc) => sum + (acc.balance ?? 0), 0);

  const openAddModal = () => {
  setEditingAccount(null);
  setNewAccount(EMPTY_ACCOUNT);
  setModalVisible(true);
};
const handleMonoConnect = (monoAccounts: MonobankAccount[]) => {
  const formattedAccounts: Account[] = monoAccounts.map(acc => ({
    id: acc.id,
    label: `Monobank ${acc.type}`,
    icon: "wallet-outline",
    color: "#10b981",
    balance: acc.balance / 100,          // convert kopiyky → UAH
    currency: acc.cashbackType || "UAH", // fallback to UAH
    isMono: true,
  }));

  setAccounts(prev => [...prev, ...formattedAccounts]);
  setMonoLinked(true);
  setMonoModalVisible(false);
  setMonoToken(""); // clear input
};


  if (selectedAccount) {
  const account = accounts.find(a => a.id === selectedAccount);
  if (!account) return null; // safety

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <AccountDetailView
        account={account}
        balance={account.balance ?? 0}
        transactions={getAccountTransactions(selectedAccount, mockTransactions)}
        onBack={() => setSelectedAccount(null)}
        onEdit={(acc) => {
          setEditingAccount(acc);
          setModalVisible(true);
        }}
        onDelete={(accountId) => {
          setAccounts(accounts.filter(a => a.id !== accountId));
          setSelectedAccount(null);
        }}
      />
    </SafeAreaView>
  );
}
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <AccountsListView
        accounts={accountsWithBalances}
        totalBalance={totalBalance}
        monoLinked={monoLinked}
        onAddAccount={openAddModal}
        onSelectAccount={setSelectedAccount}
        onLinkMono={() => setMonoModalVisible(true)}
      />
      <AccountModal
        visible={modalVisible}
        editingAccount={editingAccount}
        newAccount={newAccount}
        onClose={() => setModalVisible(false)}
        onSave={() => {}}
        onUpdateAccount={(updates) => setNewAccount({ ...newAccount, ...updates })}
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

const styles = StyleSheet.create({
  pickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  pickerLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
  },
});
