// app/(tabs)/settings/index.tsx
import { useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "@/context/SettingsContext";

export default function SettingsScreen() {
  const { currency, setCurrency, language, setLanguage } = useSettings();
  const [monoLinked, setMonoLinked] = useState(false);

  const handleMonoLink = () => {
    // here you can open a modal or navigate to Monobank linking flow
    setMonoLinked(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* System Currency */}
      <View style={styles.settingItem}>
        <Text style={styles.label}>System Currency</Text>
        <Picker
          selectedValue={currency}
          style={{ width: 120 }}
          onValueChange={(val) => setCurrency(val)}
        >
          <Picker.Item label="UAH" value="UAH" />
          <Picker.Item label="USD" value="USD" />
          <Picker.Item label="EUR" value="EUR" />
        </Picker>
      </View>

      {/* Language */}
      <View style={styles.settingItem}>
        <Text style={styles.label}>Language</Text>
        <Picker
          selectedValue={language}
          style={{ width: 120 }}
          onValueChange={(val) => setLanguage(val)}
        >
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
          disabled={monoLinked}
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
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f9fafb",
  },
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
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  monoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  monoButtonText: {
    color: "#fff",
    marginLeft: 6,
    fontWeight: "500",
  },
});
