import { View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, Alert, Pressable, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { saveMonoToken } from "@/storage/monobankToken";
import { MonobankAccount } from "@/types/types";

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
      await saveMonoToken(monoToken);
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
            <Pressable
              style={styles.infoCard}
              onPress={() => Linking.openURL("https://api.monobank.ua/index.html")}
            >
              <Text style={styles.infoTitle}>Get Monobank API token</Text>
              <Text style={styles.infoSubtitle}>
                Tap to open official Monobank authorization page
              </Text>
            </Pressable>

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
  linkText: {
  fontSize: 16,
  color: "#2563eb",
  textDecorationLine: "underline",
  marginBottom: 16,
  },
  ordinaryText:{
    fontSize: 18,
    fontWeight: "300",
    color: "#111827",
    marginBottom: 24,

  },
  linkButton: {
  borderWidth: 1,
  borderColor: "#3b82f6",
  borderRadius: 8,
  paddingVertical: 12,
  alignItems: "center",
  marginBottom: 20,
  backgroundColor: "#eff6ff",
},
linkButtonText: {
  color: "#3b82f6",
  fontSize: 16,
  fontWeight: "600",
},
infoCard: {
  backgroundColor: "#f9fafb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 20,
  borderWidth: 1,
  borderColor: "#e5e7eb",
},
infoTitle: {
  fontSize: 16,
  fontWeight: "600",
  color: "#111827",
  marginBottom: 4,
},
infoSubtitle: {
  fontSize: 14,
  color: "#6b7280",
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
