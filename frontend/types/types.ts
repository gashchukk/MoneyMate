// types.ts
export type Account = {
  id: string;
  label: string;
  icon: string;
  color: string;
  currency: string;       // optional
  balance: number;  
  isMono?: boolean;      // optional because DEFAULT_ACCOUNTS may not have it
};

export type DailySummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
};

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  account: string;
  date?: string;
};
export type TransactionType = "income" | "expense";

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

export type AccountWithBalance = Account & {
  balance: number;
};

// Type for Monobank accounts
export type MonobankAccount = {
  id: string;
  sendId: string;
  currencyCode: number;
  cashbackType: string; // e.g., "UAH"
  balance: number;      // smallest unit, e.g., kopiyky
  creditLimit: number;
  maskedPan: string[];
  type: string;         // black, white, madeInUkraine
  iban: string;
};
