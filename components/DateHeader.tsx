// components/DateHeader.tsx
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  displayDate: string;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
};

export default function DateHeader({
  displayDate,
  onPreviousDay,
  onNextDay,
  onToday,
}: Props) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onPreviousDay} style={styles.navButton}>
        <Ionicons name="chevron-back" size={24} color="#333" />
      </TouchableOpacity>

      <TouchableOpacity onPress={onToday} style={styles.dateContainer}>
        <Text style={styles.dateText}>{displayDate}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onNextDay} style={styles.navButton}>
        <Ionicons name="chevron-forward" size={24} color="#333" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingTop: 8,
  },
  navButton: {
    padding: 8,
  },
  dateContainer: {
    flex: 1,
    alignItems: "center",
  },
  dateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
});