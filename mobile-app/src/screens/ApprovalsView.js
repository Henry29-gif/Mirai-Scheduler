import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../theme";
import { fmtDay } from "../format";

// My Space → "Time-off approvals" (managers): pending leave requests.
export function ApprovalsView({ ctx }) {
  const { timeoff, respondTimeoff, busy } = ctx;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Time-off approvals {timeoff.filter((t) => t.status === "PENDING").length ? `(${timeoff.filter((t) => t.status === "PENDING").length})` : ""}</Text>
      {timeoff.filter((t) => t.status === "PENDING").length === 0 ? (
        <Text style={styles.empty}>No pending requests.</Text>
      ) : timeoff.filter((t) => t.status === "PENDING").map((t) => (
        <View key={t.id} style={styles.toApproval}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shiftName}>{t.user.firstName} {t.user.lastName}</Text>
            <Text style={styles.muted}>{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · {t.type.toLowerCase()}{t.reason ? ` · "${t.reason}"` : ""}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => respondTimeoff(t.id, true)}><Text style={styles.btnTextSm}>Approve</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => respondTimeoff(t.id, false)}><Text style={styles.linkSick}>Deny</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
