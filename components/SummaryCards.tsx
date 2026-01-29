// components/SummaryCards.tsx
import { View, Text, StyleSheet } from "react-native";
import { DailySummary } from "../types/types";

type Props = {
  summary: DailySummary;
};

export default function SummaryCards({ summary }: Props) {
  const { totalIncome, totalExpense, balance } = summary;

  return (
    <View style={styles.summaryContainer}>
      <View style={[styles.summaryCard, styles.incomeCard]}>
        <Text style={styles.summaryLabel}>Income</Text>
        <Text style={styles.summaryAmount}>+${totalIncome.toFixed(2)}</Text>
      </View>

      <View style={[styles.summaryCard, styles.expenseCard]}>
        <Text style={styles.summaryLabel}>Expenses</Text>
        <Text style={styles.summaryAmount}>-${totalExpense.toFixed(2)}</Text>
      </View>

      <View style={[styles.summaryCard, styles.balanceCard]}>
        <Text style={styles.summaryLabel}>Balance</Text>
        <Text
          style={[
            styles.summaryAmount,
            { color: balance >= 0 ? "#10b981" : "#ef4444" },
          ]}
        >
          ${balance.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  incomeCard: {
    borderLeftWidth: 3,
    borderLeftColor: "#10b981",
  },
  expenseCard: {
    borderLeftWidth: 3,
    borderLeftColor: "#ef4444",
  },
  balanceCard: {
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
    fontWeight: "500",
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
});