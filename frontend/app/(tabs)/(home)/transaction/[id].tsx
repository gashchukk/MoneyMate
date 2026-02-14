import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { DEFAULT_ACCOUNTS, mockTransactions } from "@/constants/constrants";

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams();
  const transactionId = Array.isArray(id) ? id[0] : id;

  // Find the transaction (this is simplified, in real app you'd have better data management)
  let transaction = null;
  for (const dateKey in mockTransactions) {
    const found = mockTransactions[dateKey].find(t => t.id === transactionId);
    if (found) {
      transaction = found;
      break;
    }
  }

  if (!transaction) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Transaction not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const account = DEFAULT_ACCOUNTS.find(a => a.id === transaction.account);
  const isIncome = transaction.amount > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Transaction Details</Text>
      </View>

      <View style={styles.detailContainer}>
        <Text style={styles.label}>Title:</Text>
        <Text style={styles.value}>{transaction.title}</Text>

        <Text style={styles.label}>Amount:</Text>
        <Text style={[styles.value, { color: isIncome ? "#10b981" : "#ef4444" }]}>
          {isIncome ? "+" : ""}{transaction.amount.toFixed(2)}$
        </Text>

        <Text style={styles.label}>Type:</Text>
        <Text style={styles.value}>{transaction.type}</Text>

        <Text style={styles.label}>Category:</Text>
        <Text style={styles.value}>{transaction.category}</Text>

        <Text style={styles.label}>Account:</Text>
        <Text style={styles.value}>{account?.label || transaction.account}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 16,
  },
  detailContainer: {
    padding: 16,
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 16,
  },
  value: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
  },
});