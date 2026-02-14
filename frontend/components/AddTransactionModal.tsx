// components/AddTransactionModal.tsx
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NewTransactionForm } from "../types/types";

type Account = {
  id: string;
  label: string;
  icon: string;
  color: string;
};

type Props = {
  visible: boolean;
  transaction: NewTransactionForm;
  accounts: Account[];
  onClose: () => void;
  onSubmit: () => void;
  onUpdateTransaction: (updates: Partial<NewTransactionForm>) => void;
};

export default function AddTransactionModal({
  visible,
  transaction,
  accounts,
  onClose,
  onSubmit,
  onUpdateTransaction,
}: Props) {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Transaction</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Type Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                transaction.type === "expense" && styles.typeButtonActive,
              ]}
              onPress={() => onUpdateTransaction({ type: "expense" })}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  transaction.type === "expense" && styles.typeButtonTextActive,
                ]}
              >
                Expense
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                transaction.type === "income" && styles.typeButtonActive,
              ]}
              onPress={() => onUpdateTransaction({ type: "income" })}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  transaction.type === "income" && styles.typeButtonTextActive,
                ]}
              >
                Income
              </Text>
            </TouchableOpacity>
          </View>

          {/* Title Input */}
          <TextInput
            style={styles.input}
            placeholder="Title"
            value={transaction.title}
            onChangeText={(text) => onUpdateTransaction({ title: text })}
          />

          {/* Amount Input */}
          <TextInput
            style={styles.input}
            placeholder="Amount"
            keyboardType="numeric"
            value={transaction.amount}
            onChangeText={(text) => onUpdateTransaction({ amount: text })}
          />

          {/* Category Input */}
          <TextInput
            style={styles.input}
            placeholder="Category (optional)"
            value={transaction.category}
            onChangeText={(text) => onUpdateTransaction({ category: text })}
          />

          {/* Account Selector */}
          <Text style={styles.inputLabel}>Account</Text>
          <View style={styles.accountSelector}>
            {accounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[
                  styles.accountOption,
                  transaction.account === account.id && styles.accountOptionActive,
                ]}
                onPress={() => onUpdateTransaction({ account: account.id })}
              >
                <Ionicons
                  name={account.icon as any}
                  size={20}
                  color={
                    transaction.account === account.id
                      ? account.color
                      : "#9ca3af"
                  }
                />
                <Text
                  style={[
                    styles.accountOptionText,
                    transaction.account === account.id && {
                      color: account.color,
                    },
                  ]}
                >
                  {account.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Submit Button */}
          <TouchableOpacity style={styles.submitButton} onPress={onSubmit}>
            <Text style={styles.submitButtonText}>Add Transaction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  typeSelector: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  typeButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeButtonTextActive: {
    color: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: "#f9fafb",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  accountSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  accountOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    minWidth: "48%",
  },
  accountOptionActive: {
    backgroundColor: "#f0f9ff",
    borderColor: "#3b82f6",
  },
  accountOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  submitButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});