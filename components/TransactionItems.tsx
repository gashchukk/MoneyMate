// components/TransactionItem.tsx
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Transaction } from "../types/homeTypes";

type Account = {
  id: string;
  label: string;
  icon: string;
  color: string;
};

type Props = {
  transaction: Transaction;
  accountInfo: Account;
  onDelete: (id: string) => void;
};

export default function TransactionItem({
  transaction,
  accountInfo,
  onDelete,
}: Props) {
  const isIncome = transaction.amount > 0;

  return (
    <View style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <View
          style={[
            styles.iconContainer,
            isIncome ? styles.incomeIcon : styles.expenseIcon,
          ]}
        >
          <Ionicons
            name={isIncome ? "arrow-down" : "arrow-up"}
            size={16}
            color="#fff"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.transactionTitle}>{transaction.title}</Text>
          <View style={styles.transactionMeta}>
            <Text style={styles.transactionCategory}>
              {transaction.category}
            </Text>
            <View style={styles.accountBadge}>
              <Ionicons
                name={accountInfo.icon as any}
                size={12}
                color={accountInfo.color}
              />
              <Text style={[styles.accountText, { color: accountInfo.color }]}>
                {accountInfo.label}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.transactionRight}>
        <Text
          style={[
            styles.transactionAmount,
            { color: isIncome ? "#10b981" : "#ef4444" },
          ]}
        >
          {isIncome ? "+" : ""}
          {transaction.amount.toFixed(2)}$
        </Text>
        <TouchableOpacity onPress={() => onDelete(transaction.id)}>
          <Ionicons name="trash-outline" size={18} color="#999" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    flex: 1,
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
  transactionCategory: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  transactionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  accountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
  },
  accountText: {
    fontSize: 11,
    fontWeight: "600",
  },
  transactionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
});