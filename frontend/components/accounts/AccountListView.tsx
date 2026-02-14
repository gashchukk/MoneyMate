import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AccountWithBalance } from "../../types/types";
import { getRate } from "../../utils/utils";
import { useSettings } from "@/context/SettingsContext";
import { ScrollView } from "react-native"; // import ScrollView

type Props = {
  accounts: AccountWithBalance[];
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onLinkMono: () => void;
};

type ConvertedAccount = AccountWithBalance & {
  convertedBalance: number;
};

export default function AccountsListView({
  accounts,
  onAddAccount,
  onSelectAccount,
  onLinkMono,
}: Props) {
  const { currency: displayCurrency } = useSettings(); // system currency
  const [convertedAccounts, setConvertedAccounts] = useState<ConvertedAccount[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [rates, setRates] = useState<Record<string, number>>({}); // store rates for tiles

  // Add at the top of your component
const [exchangeRates, setExchangeRates] = useState<{ currency: string; rate: number }[]>([]);

useEffect(() => {
  async function fetchAndConvert() {
    const allCurrencies = Array.from(
      new Set([...accounts.map(acc => acc.currency), displayCurrency, "USD", "EUR"])
    );

    const rates: { [key: string]: number } = {};
    for (const curr of allCurrencies) {
      rates[curr] = await getRate(curr);
    }

    // Prepare converted balances for accounts
    const converted: ConvertedAccount[] = accounts.map(acc => ({
      ...acc,
      convertedBalance: acc.balance * (rates[acc.currency] / rates[displayCurrency]),
    }));

    // Prepare exchange rate tiles
    const tiles = ["USD", "EUR"].map(curr => ({
      currency: curr,
      rate: rates[curr] / rates[displayCurrency],
    }));

    const sum = converted.reduce((a, acc) => a + acc.convertedBalance!, 0);

    setConvertedAccounts(converted);
    setTotalBalance(sum);
    setExchangeRates(tiles);
  }

  fetchAndConvert();
}, [accounts, displayCurrency]);



return (
  <View style={styles.container}>
    {/* Header */}
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Accounts</Text>
      <TouchableOpacity onPress={onAddAccount} style={styles.addAccountButton}>
        <Ionicons name="add-circle" size={28} color="#3b82f6" />
      </TouchableOpacity>
    </View>

    {/* Total Balance Card */}
    <View style={styles.totalBalanceCard}>
      <Text style={styles.totalBalanceLabel}>Total Balance</Text>
      <Text
        style={[
          styles.totalBalanceAmount,
          { color: totalBalance >= 0 ? "#10b981" : "#ef4444" },
        ]}
      >
        {totalBalance.toFixed(2)} {displayCurrency}
      </Text>
      <Text style={styles.totalBalanceSubtext}>Across all accounts</Text>
    </View>

    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Exchange Rate Tiles */}
      {/* Exchange Rate Tiles */}
      <View style={styles.tilesContainer}>
        {exchangeRates.map(er => (
          <View key={er.currency} style={styles.tile}>
            <Text style={styles.tileText}>
              1 {er.currency} ≈ {er.rate.toFixed(2)} {displayCurrency}
            </Text>
          </View>
        ))}
      </View>


      {/* Accounts List */}
      <View style={styles.accountsSection}>
        <Text style={styles.sectionTitle}>Your Accounts</Text>
        {convertedAccounts.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.accountCard}
            onPress={() => onSelectAccount(item.id)}
          >
            <View style={styles.accountCardLeft}>
              <View style={[styles.accountIcon, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon as any} size={24} color="#fff" />
              </View>
              <View>
                <Text style={styles.accountName}>{item.label}</Text>
                <Text style={styles.accountBalance}>
                  {item.balance.toFixed(2)} {item.currency}
                </Text>
                {item.currency !== displayCurrency && (
                  <Text style={[styles.accountBalance, { fontSize: 14, color: "#6b7280" }]}>
                    ≈ {item.convertedBalance?.toFixed(2)} {displayCurrency}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  </View>
);
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    padding: 16,
    paddingTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tilesContainer: {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
  paddingHorizontal: 16,
  marginBottom: 12,
},
tile: {
  backgroundColor: "#fff",
  padding: 12,
  borderRadius: 12,
  width: "48%",
  marginBottom: 8,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 2,
},
tileText: {
  fontSize: 14,
  fontWeight: "600",
  color: "#111827",
  textAlign: "center",
},

  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  addAccountButton: {
    padding: 4,
  },
    modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    width: "80%",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  closeButton: {
    marginTop: 16,
    backgroundColor: "#3b82f6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  totalBalanceCard: {
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
  },
  totalBalanceLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
    fontWeight: "500",
  },
  totalBalanceAmount: {
    fontSize: 40,
    fontWeight: "700",
    marginBottom: 4,
  },
  totalBalanceSubtext: {
    fontSize: 12,
    color: "#9ca3af",
  },
  accountsSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  accountCardLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3b82f6",
  },
  monoSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  monoButton: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    padding: 16,
    borderRadius: 12,
  },
  monoButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});