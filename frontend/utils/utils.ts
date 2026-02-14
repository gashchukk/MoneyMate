// utils.ts
import { Transaction, TransactionsByDate } from "../types/types";

export const calculateAccountBalance = (
  accountId: string,
  transactions: TransactionsByDate
): number => {
  let balance = 0;
  Object.values(transactions).forEach((dayTransactions) => {
    dayTransactions.forEach((transaction) => {
      if (transaction.account === accountId) {
        balance += transaction.amount;
      }
    });
  });
  return balance;
};

export const getAccountTransactions = (
  accountId: string,
  transactions: TransactionsByDate
): Transaction[] => {
  const accountTransactions: Transaction[] = [];
  Object.entries(transactions).forEach(([date, dayTransactions]) => {
    dayTransactions.forEach((transaction) => {
      if (transaction.account === accountId) {
        accountTransactions.push({ ...transaction, date });
      }
    });
  });
  return accountTransactions.sort(
    (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()
  );
};

export const getRate = async (currency: string): Promise<number> => {
  if (currency === "UAH") return 1;

  const res = await fetch(
    `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${currency}&json`
  );
  const data = await res.json();

  return data[0]?.rate ?? 1;
};


export const convertCurrency = async (
  amount: number,
  from: string,
  to: string
): Promise<number> => {
  if (from === to) return amount;

  const fromRate = await getRate(from);
  const toRate = await getRate(to);

  return (amount / fromRate) * toRate;
};
