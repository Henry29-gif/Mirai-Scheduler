import React from "react";
import { View, Text } from "react-native";
import { C, styles } from "../theme";
import { fmtT, fmtDay, fmtMins } from "../format";

// My Space → "My timecard" (staff): own clock-in history & hours.
export function MyTimecardView({ ctx }) {
  const { timecard } = ctx;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>My timecard {timecard ? `· ${fmtMins(timecard.totalMinutes)}` : ""}</Text>
      {(!timecard || timecard.days.length === 0) ? (
        <Text style={styles.empty}>No clock-ins yet. Use the Time clock on your home screen.</Text>
      ) : timecard.days.map((d) => (
        <View key={d.date} style={styles.tcDay}>
          <Text style={{ fontWeight: "500", color: C.text }}>{fmtDay(d.date)}  <Text style={styles.muted}>· {fmtMins(d.minutes)}</Text></Text>
          {d.sessions.map((s, i) => (
            <Text key={i} style={styles.muted}>{fmtT(s.in)} – {s.out ? fmtT(s.out) : "in progress"}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}
