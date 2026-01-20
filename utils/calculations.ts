// utils/calculations.ts
import { Transaction, DailySummary } from "../types/homeTypes";

export function calculateDailySummary(transactions: Transaction[]): DailySummary {
  const totalIncome = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const balance = totalIncome - totalExpense;

  return { totalIncome, totalExpense, balance };
}