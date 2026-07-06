import React from "react";
import { View, Text } from "react-native";
import { styles } from "../theme";
import { CertChip } from "../ui";
import { fmtT, fmtMins } from "../format";

// My Space → "Live attendance" (managers): who's clocked in right now.
export function AttendanceView({ ctx }) {
  const { siteSwitcher, attendance } = ctx;
  return (
    <View style={styles.card}>
      {siteSwitcher}
      <Text style={styles.cardTitle}>Who's clocked in · {attendance.onNow.length}/{attendance.totalStaff}</Text>
      {attendance.onNow.length === 0 ? <Text style={styles.empty}>No one is clocked in right now.</Text> : attendance.onNow.map((p) => (
        <View key={p.id} style={styles.shiftRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowMid}><View style={styles.onDot} /><Text style={styles.shiftName}> {p.firstName} {p.lastName}  </Text><CertChip value={p.certification} /></View>
            <Text style={styles.muted}>On since {fmtT(p.since)} · {fmtMins(p.minutes)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
