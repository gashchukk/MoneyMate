import { View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, Alert, Pressable, KeyboardAvoidingView, Platform } from "react-native";

type MonobankAccount = {
  id: string;
  sendId: string;
  currencyCode: number;
  cashbackType: string;
  balance: number;
  creditLimit: number;
  maskedPan: string[];
  type: string;
  iban: string;
};

type Props = {
  visible: boolean;
  monoToken: string;
  onClose: () => void;
  onConnect: (accounts: MonobankAccount[]) => void; // pass fetched accounts
  onTokenChange: (token: string) => void;
};

export default function MonobankModal({
  visible,
  monoToken,
  onClose,
  onConnect,
  onTokenChange,
}: Props) {
  const handleConnect = async () => {
    if (monoToken.length <= 20) {
      Alert.alert("Connection failed", "Invalid API token");
      return;
    }

    try {
      const response = await fetch("https://api.monobank.ua/personal/client-info", {
        method: "GET",
        headers: {
          "X-Token": monoToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();

      if (!data.accounts || !Array.isArray(data.accounts)) {
        Alert.alert("Error", "No accounts found in Monobank response");
        return;
      }

      // Pass accounts to parent
      onConnect(data.accounts);
    } catch (error) {
      console.log(error);
      Alert.alert("Connection failed", "Could not fetch Monobank accounts");
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable onPress={() => {}} style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connect Monobank</Text>

            <TextInput
              style={styles.input}
              placeholder="Paste your Monobank API token"
              value={monoToken}
              onChangeText={onTokenChange}
              autoCapitalize="none"
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleConnect}>
              <Text style={styles.submitButtonText}>Connect</Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
    backgroundColor: "#f9fafb",
  },
  submitButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
