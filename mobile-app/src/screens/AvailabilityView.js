import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C, styles } from "../theme";

// My Space → "My availability" (staff): weekly grid of shifts I can work.
export function AvailabilityView({ ctx }) {
  const { isBlocked, toggleAvail } = ctx;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>My availability</Text>
      <Text style={[styles.muted, { marginBottom: 10 }]}>Tap a slot to mark yourself off.</Text>
      <View style={styles.availRow}>
        <Text style={styles.availDayLabel}></Text>
        {["Day", "Eve", "Night"].map((s) => <Text key={s} style={styles.availColLabel}>{s}</Text>)}
      </View>
      {[["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]].map(([label, dow]) => (
        <View key={dow} style={styles.availRow}>
          <Text style={styles.availDayLabel}>{label}</Text>
          {["Day", "Evening", "Night"].map((s) => {
            const off = isBlocked(dow, s);
            return (
              <TouchableOpacity key={s} style={[styles.availCell, { backgroundColor: off ? C.errorSoft : C.accentSoft }]} onPress={() => toggleAvail(dow, s)}>
                <Text style={{ color: off ? C.error : C.accent, fontWeight: "500", fontSize: 12 }}>{off ? "Off" : "On"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
