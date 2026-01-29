import { router } from 'expo-router';
import { useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AddTransactionModal from "@/components/AddTransactionModal";
import DateHeader from "@/components/DateHeader";
import SummaryCards from "@/components/SummaryCards";
import TransactionsList from "@/components/TransactionsList";
import { DEFAULT_ACCOUNTS, mockTransactions } from "@/constants/constrants";
import { NewTransactionForm, TransactionsByDate } from "@/types/homeTypes";
import { calculateDailySummary } from "@/utils/calculations";
import { changeDay, formatDate, formatDisplayDate } from "@/utils/dateUtils";

export default function HomeScreen() {
  const insets = useSafeAreaInsets(); // get safe area insets for top/bottom

  const [date, setDate] = useState(new Date());
  const [transactions, setTransactions] = useState<TransactionsByDate>(mockTransactions);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTransaction, setNewTransaction] = useState<NewTransactionForm>({
    title: "",
    amount: "",
    type: "expense",
    category: "other",
    account: "cash",
  });

  const dateKey = formatDate(date);
  const dayTransactions = transactions[dateKey] || [];
  const summary = calculateDailySummary(dayTransactions);

  const handleChangeDay = (diff: number) => setDate(changeDay(date, diff));
  const handleGoToToday = () => setDate(new Date());

  const handleAddTransaction = () => {
    if (!newTransaction.title || !newTransaction.amount) return;

    const amount =
      newTransaction.type === "income"
        ? Math.abs(parseFloat(newTransaction.amount))
        : -Math.abs(parseFloat(newTransaction.amount));

    const transaction = {
      id: Date.now().toString(),
      title: newTransaction.title,
      amount,
      type: newTransaction.type,
      category: newTransaction.category,
      account: newTransaction.account,
    };

    setTransactions((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), transaction],
    }));

    setNewTransaction({
      title: "",
      amount: "",
      type: "expense",
      category: "other",
      account: "cash",
    });
    setModalVisible(false);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).filter((t) => t.id !== id),
    }));
  };

  const updateNewTransaction = (updates: Partial<NewTransactionForm>) => {
    setNewTransaction({ ...newTransaction, ...updates });
  };

  return (
    <SafeAreaView>
      <DateHeader
        displayDate={formatDisplayDate(date)}
        onPreviousDay={() => handleChangeDay(-1)}
        onNextDay={() => handleChangeDay(1)}
        onToday={handleGoToToday}
      />

      <SummaryCards summary={summary} />

      <TransactionsList
        transactions={dayTransactions}
        accounts={DEFAULT_ACCOUNTS}
        onAddTransaction={() => setModalVisible(true)}
        onDeleteTransaction={handleDeleteTransaction}
        onSelectTransaction={(id) => router.push(`./transaction/${id}`)}
      />

      <AddTransactionModal
        visible={modalVisible}
        transaction={newTransaction}
        accounts={DEFAULT_ACCOUNTS}
        onClose={() => setModalVisible(false)}
        onSubmit={handleAddTransaction}
        onUpdateTransaction={updateNewTransaction}
      />
    </SafeAreaView>
  );
}

// Wrap your **app entry** in SafeAreaProvider once (App.tsx or _layout.tsx)
export function AppWrapper({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
});
