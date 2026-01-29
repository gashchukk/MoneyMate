import { useAccounts } from "@/context/AccountsContext";
import { useSettings } from "@/context/SettingsContext";
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMonoToken, saveMonoToken } from "@/storage/monobankToken";
import { useState, useEffect } from "react";
import { Picker } from "@react-native-picker/picker";
import { Account, MonobankAccount } from "@/types/types";

export default function SettingsScreen() {
  const { currency, setCurrency, language, setLanguage, monoLinked, setMonoLinked } = useSettings();
  const {accounts, setAccounts} = useAccounts();


  const [monoToken, setMonoToken] = useState("");

  // On mount: check for saved token and existing mono accounts
  useEffect(() => {
    (async () => {
      const token = await getMonoToken();
      if (token) {
        setMonoToken(token);
        setMonoLinked(accounts.some(acc => acc.isMono));
      }
    })();
  }, [accounts]);

  // Handle Monobank linking
  const handleMonoLink = async () => {
    if (monoLinked) {
      Alert.alert("Monobank Linked", "Your account is already linked.");
      return;
    }

    // Reuse token if exists
    if (monoToken) {
      await fetchMonoAccounts(monoToken);
      setMonoLinked(true);
      Alert.alert("Monobank Linked", "Using your previously saved API key.");
    } else {
      const newToken = "dummy-mono-token"; // replace with real Monobank linking flow
      await saveMonoToken(newToken);
      setMonoToken(newToken);
      await fetchMonoAccounts(newToken);
      setMonoLinked(true);
      Alert.alert("Monobank Linked", "Your account is now linked.");
    }
  };

  // Fetch accounts from Monobank API
  const fetchMonoAccounts = async (token: string) => {
    try {
      const response = await fetch("https://api.monobank.ua/personal/client-info", {
        method: "GET",
        headers: { "X-Token": token },
      });

      if (!response.ok) throw new Error("Failed to fetch Monobank accounts");

      const data = await response.json();
      if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
        const formattedAccounts: Account[] = data.accounts.map((acc: MonobankAccount) => ({
          id: acc.id.toString(),
          label: `Monobank ${acc.type}`,
          icon: "wallet-outline",
          color: "#10b981",
          balance: acc.balance / 100,
          currency: acc.cashbackType || "UAH",
          isMono: true,
        }));

        setAccounts((prev : Account[]) => {
          const existingIds = new Set(prev.map(acc => acc.id));
          const newAccounts = formattedAccounts.filter(acc => !existingIds.has(acc.id));
          return [...prev, ...newAccounts];
        });
      }
    } catch (err) {
      console.log("Monobank fetch failed:", err);
      setMonoLinked(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* System Currency */}
      <View style={styles.settingItem}>
        <Text style={styles.label}>System Currency</Text>
        <Picker selectedValue={currency} style={{ width: 120 }} onValueChange={setCurrency}>
          <Picker.Item label="UAH" value="UAH" />
          <Picker.Item label="USD" value="USD" />
          <Picker.Item label="EUR" value="EUR" />
        </Picker>
      </View>

      {/* Language */}
      <View style={styles.settingItem}>
        <Text style={styles.label}>Language</Text>
        <Picker selectedValue={language} style={{ width: 120 }} onValueChange={setLanguage}>
          <Picker.Item label="English" value="en" />
          <Picker.Item label="Українська" value="uk" />
          <Picker.Item label="Русский" value="ru" />
        </Picker>
      </View>

      {/* Monobank Link */}
      <View style={styles.settingItem}>
        <Text style={styles.label}>Monobank</Text>
        <TouchableOpacity
          style={[styles.monoButton, monoLinked && { backgroundColor: "#10b981" }]}
          onPress={handleMonoLink}
        >
          <Ionicons name="link-outline" size={20} color="#fff" />
          <Text style={styles.monoButtonText}>
            {monoLinked ? "Monobank Linked" : "Link Monobank Account"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f9fafb" },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: { fontSize: 16, fontWeight: "500" },
  monoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  monoButtonText: { color: "#fff", marginLeft: 6, fontWeight: "500" },
});
