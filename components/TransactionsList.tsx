// components/TransactionsList.tsx
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Transaction } from "../types/homeTypes";
import TransactionItem from "./TransactionItems";

type Account = {
  id: string;
  label: string;
  icon: string;
  color: string;
};

type Props = {
  transactions: Transaction[];
  accounts: Account[];
  onAddTransaction: () => void;
  onDeleteTransaction: (id: string) => void;
};

export default function TransactionsList({
  transactions,
  accounts,
  onAddTransaction,
  onDeleteTransaction,
}: Props) {
  const getAccountInfo = (accountId: string): Account => {
    return accounts.find(a => a.id === accountId) || accounts[0];
  };

  return (
    <>
      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
        <TouchableOpacity onPress={onAddTransaction} style={styles.addButton}>
          <Ionicons name="add-circle" size={28} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No transactions for this day</Text>
            <Text style={styles.emptySubtext}>Tap + to add a transaction</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionItem
            transaction={item}
            accountInfo={getAccountInfo(item.account)}
            onDelete={onDeleteTransaction}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  transactionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  addButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 16,
    color: "#999",
    fontSize: 16,
    fontWeight: "500",
  },
  emptySubtext: {
    textAlign: "center",
    marginTop: 4,
    color: "#ccc",
    fontSize: 14,
  },
});