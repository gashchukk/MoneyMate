// constants.ts
import { Account } from "../types/types";

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "cash", label: "Cash", icon: "cash-outline", color: "#10b981", currency: "UAH", balance: 0.0 },
  { id: "credit", label: "Credit Card", icon: "card", color: "#f59e0b", currency: "UAH", balance: 0.0 },
];

export const AVAILABLE_ICONS = [
  "cash-outline",
  "card-outline",
  "card",
  "wallet-outline",
  "business-outline",
  "globe-outline",
  "phone-portrait-outline",
  "gift-outline",
  "home-outline",
  "car-outline",
];

export const AVAILABLE_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

// Mock transactions data - in real app, this would come from props or context
import { Transaction } from "../types/types";

export const mockTransactions: Record<string, Transaction[]> = {
  "2026-01-20": [
    { id: "1", title: "Salary", amount: 1200, type: "income", category: "salary", account: "card" },
    { id: "2", title: "Groceries", amount: -45, type: "expense", category: "food", account: "card" },
    { id: "3", title: "Coffee", amount: -5, type: "expense", category: "food", account: "cash" },
  ],
  "2026-01-21": [
    { id: "4", title: "Transport", amount: -12, type: "expense", category: "transport", account: "cash" },
    { id: "5", title: "Online Shopping", amount: -89, type: "expense", category: "shopping", account: "credit" },
  ],
  "2026-01-19": [
    { id: "6", title: "Freelance Payment", amount: 500, type: "income", category: "work", account: "card" },
    { id: "7", title: "Savings Deposit", amount: 200, type: "income", category: "transfer", account: "savings" },
  ],
};
