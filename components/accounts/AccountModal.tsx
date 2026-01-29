// AccountModal.tsx
import { Ionicons } from "@expo/vector-icons";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { AVAILABLE_COLORS, AVAILABLE_ICONS } from "@/constants/constrants";
import { Account } from "@/types/types";

type Props = {
  visible: boolean;
  editingAccount: Account | null;
  newAccount: {
    label: string;
    icon: string;
    color: string;
    balance: number;
    currency: string;
  };
  onUpdateAccount: (updates: Partial<any>) => void;
  onSave: () => void;
  onClose: () => void;
};


export default function AccountModal({
  visible,
  editingAccount,
  newAccount,
  onClose,
  onSave,
  onUpdateAccount,
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
            <Text style={styles.modalTitle}>
              {editingAccount ? "Edit Account" : "Add Account"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Account Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Personal Checking"
              value={newAccount.label}
              onChangeText={(text) => onUpdateAccount({ label: text })}
            />
            <TextInput
            style={styles.input}
            placeholder="Initial balance"
            keyboardType="numeric"
            value={String(newAccount.balance)}
            onChangeText={(v) =>
                onUpdateAccount({ balance: Number(v) || 0 })
            }
            />

            <View style={styles.currencyRow}>
            {["UAH", "USD", "EUR"].map((cur) => (
                <TouchableOpacity
                key={cur}
                style={[
                    styles.currencyButton,
                    newAccount.currency === cur && styles.currencyActive,
                ]}
                onPress={() => onUpdateAccount({ currency: cur })}
                >
                <Text>{cur}</Text>
                </TouchableOpacity>
            ))}
            </View>

            <Text style={styles.inputLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {AVAILABLE_ICONS.map((iconName) => (
                <TouchableOpacity
                  key={iconName}
                  style={[
                    styles.iconOption,
                    newAccount.icon === iconName && styles.iconOptionActive,
                  ]}
                  onPress={() => onUpdateAccount({ icon: iconName })}
                >
                  <Ionicons
                    name={iconName as any}
                    size={24}
                    color={newAccount.icon === iconName ? newAccount.color : "#9ca3af"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {AVAILABLE_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    newAccount.color === color && styles.colorOptionActive,
                  ]}
                  onPress={() => onUpdateAccount({ color: color })}
                >
                  {newAccount.color === color && (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.previewSection}>
              <Text style={styles.inputLabel}>Preview</Text>
              <View style={styles.previewCard}>
                <View
                  style={[styles.accountIcon, { backgroundColor: newAccount.color }]}
                >
                  <Ionicons name={newAccount.icon as any} size={24} color="#fff" />
                </View>
                <Text style={styles.previewLabel}>
                  {newAccount.label || "Account Name"}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={onSave}>
              <Text style={styles.submitButtonText}>
                {editingAccount ? "Save Changes" : "Add Account"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
    maxHeight: "80%",
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
  currencyRow: {
  flexDirection: "row",
  gap: 8,
  marginTop: 8,
},
currencyButton: {
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#e5e7eb",
},
currencyActive: {
  backgroundColor: "#3b82f6",
  borderColor: "#3b82f6",
},

  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 8,
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
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  iconOption: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  iconOptionActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#f0f9ff",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorOptionActive: {
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  previewSection: {
    marginTop: 16,
    marginBottom: 8,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 12,
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