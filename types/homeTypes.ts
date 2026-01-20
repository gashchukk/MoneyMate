// types/homeTypes.ts
export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  account: string;
};

export type TransactionsByDate = {
  [date: string]: Transaction[];
};

export type NewTransactionForm = {
  title: string;
  amount: string;
  type: TransactionType;
  category: string;
  account: string;
};

export type DailySummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
};