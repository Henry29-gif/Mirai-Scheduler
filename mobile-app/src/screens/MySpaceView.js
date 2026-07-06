import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C, styles } from "../theme";

// The My Space menu: role-based links to every sub-view + delete account.
export function MySpaceView({ ctx }) {
  const { isManager, isAdmin, setView, deleteAccount } = ctx;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>My Space</Text>
      {(isManager
        ? [
            { label: "Staffing & schedule", sub: "Set needs, generate, balance & post", v: "scheduling" },
            ...(isAdmin ? [{ label: "My Staff", sub: "Profiles, pay & reliability", v: "mystaff" }] : []),
            { label: "Live attendance", sub: "Who's clocked in right now", v: "attendance" },
            { label: "Timecards", sub: "Review & approve staff hours", v: "factimecards" },
            { label: "Time-off approvals", sub: "Review staff leave requests", v: "approvals" },
          ]
        : [{ label: "Request time off", sub: "Submit and track leave requests", v: "timeoff" }, { label: "My availability", sub: "Set the shifts you can work", v: "availability" }, { label: "My timecard", sub: "Your clock-in history & hours", v: "timecard" }, { label: "Certification", sub: "Your licenses & expiry dates", v: "certs" }]
      ).map((it) => (
        <TouchableOpacity key={it.v} style={styles.myspaceLink} onPress={() => setView(it.v)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.myspaceLinkTitle}>{it.label}</Text>
            <Text style={styles.muted}>{it.sub}</Text>
          </View>
          <Text style={{ color: C.text2, fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>Delete account</Text>
        <Text style={styles.muted}>Erases your personal details and disables sign-in. This can't be undone.</Text>
        <TouchableOpacity style={styles.btnDanger} onPress={deleteAccount}>
          <Text style={styles.btnDangerText}>Delete account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
