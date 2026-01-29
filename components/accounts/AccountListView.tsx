import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useEffect, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AccountWithBalance } from "../../types/types";
import { getRate } from "../../utils/utils";

type Props = {
  accounts: AccountWithBalance[];
  monoLinked: boolean;
  totalBalance: number;      
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onLinkMono: () => void;
};
type ConvertedAccount = AccountWithBalance & {
  convertedBalance: number;
};


export default function AccountsListView({
  accounts,
  monoLinked,
  onAddAccount,
  onSelectAccount,
  onLinkMono,
}: Props) {
  const [displayCurrency, setDisplayCurrency] = useState("UAH");
  const [modalVisible, setModalVisible] = useState(false);
  const [totalBalance, setTotalBalance] = useState(0);
  const [convertedAccounts, setConvertedAccounts] = useState<ConvertedAccount[]>([]);

  useEffect(() => {
    async function fetchAndConvert() {
      const allCurrencies = Array.from(
        new Set([...accounts.map(acc => acc.currency), displayCurrency])
      );

      // Fetch all rates once
      const rates: { [key: string]: number } = {};
      for (const curr of allCurrencies) {
        rates[curr] = await getRate(curr);
      }

      // Convert accounts
      const converted: ConvertedAccount[] = accounts.map(acc => ({
        ...acc,
        convertedBalance: acc.balance * (rates[acc.currency] / rates[displayCurrency]),
      }));


      // Sum total balance
      const sum = converted.reduce((a, acc) => a + acc.convertedBalance!, 0);

      setConvertedAccounts(converted);
      setTotalBalance(sum);
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
      <TouchableOpacity style={styles.totalBalanceCard} onPress={() => setModalVisible(true)}>
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
      </TouchableOpacity>

      {/* Accounts List */}
      <View style={styles.accountsSection}>
        <Text style={styles.sectionTitle}>Your Accounts</Text>
        <FlatList
          data={convertedAccounts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
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
                    {item.convertedBalance?.toFixed(2)} {displayCurrency}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        />
      </View>
    <View style={styles.monoSection}>
        <Text style={styles.sectionTitle}>Bank Integration</Text>

        <TouchableOpacity
            style={[styles.monoButton, monoLinked && { backgroundColor: "#10b981" }]}
            onPress={onLinkMono}
            disabled={monoLinked}
        >
            <Ionicons name="link-outline" size={20} color="#fff" />
            <Text style={styles.monoButtonText}>
            {monoLinked ? "Monobank Linked" : "Link your Monobank account"}
            </Text>
        </TouchableOpacity>
    </View>
      {/* Currency Picker Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Display Currency</Text>
            <Picker
              selectedValue={displayCurrency}
              onValueChange={(val) => setDisplayCurrency(val)}
            >
              <Picker.Item label="UAH" value="UAH" />
              <Picker.Item label="USD" value="USD" />
              <Picker.Item label="EUR" value="EUR" />
            </Picker>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
              <Text style={styles.closeButton}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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