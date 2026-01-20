// AccountDetailView.tsx
import { Ionicons } from "@expo/vector-icons";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Account, Transaction } from "../types/types";

type Props = {
  account: Account;
  balance: number;
  transactions: Transaction[];
  onBack: () => void;
  onEdit: (account: Account) => void;
  onDelete: (accountId: string) => void;
};

export default function AccountDetailView({
  account,
  balance,
  transactions,
  onBack,
  onEdit,
  onDelete,
}: Props) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{account.label}</Text>
        <TouchableOpacity onPress={() => onEdit(account)} style={styles.editButton}>
          <Ionicons name="create-outline" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Account Balance Card */}
      <View style={[styles.balanceCard, { borderLeftColor: account.color }]}>
        <View style={[styles.accountIconLarge, { backgroundColor: account.color }]}>
          <Ionicons name={account.icon as any} size={32} color="#fff" />
        </View>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={[styles.balanceAmount, { color: balance >= 0 ? "#10b981" : "#ef4444" }]}>
        {balance.toFixed(2)} {account.currency ?? "$"}
        </Text>

      </View>

      {/* Transaction History */}
      <View style={styles.transactionsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          <TouchableOpacity onPress={() => onDelete(account.id)} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No transactions for this account</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.transactionItem}>
              <View style={styles.transactionLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    item.amount > 0 ? styles.incomeIcon : styles.expenseIcon,
                  ]}
                >
                  <Ionicons
                    name={item.amount > 0 ? "arrow-down" : "arrow-up"}
                    size={16}
                    color="#fff"
                  />
                </View>
                <View>
                  <Text style={styles.transactionTitle}>{item.title}</Text>
                  <Text style={styles.transactionDate}>{item.date}</Text>
                </View>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: item.amount > 0 ? "#10b981" : "#ef4444" },
                ]}
              >
                {item.amount > 0 ? "+" : ""}
                {item.amount.toFixed(2)}$
              </Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 24,
  },
  backButton: {
    padding: 4,
  },
  editButton: {
    padding: 4,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  balanceCard: {
    margin: 16,
    marginTop: 8,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
  },
  accountIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
    fontWeight: "500",
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: "700",
  },
  transactionsSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "600",
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  incomeIcon: {
    backgroundColor: "#10b981",
  },
  expenseIcon: {
    backgroundColor: "#ef4444",
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 40,
    fontSize: 14,
  },
});