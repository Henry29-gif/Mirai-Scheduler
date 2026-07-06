import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C, styles } from "../theme";
import { CertChip } from "../ui";
import { fmtT, fmtMins } from "../format";

// My Space → "Live attendance" (managers): who's clocked in right now.
// Admins get chips to flip between homes — or "All homes", which shows every
// facility's clocked-in staff on one page (the default).
export function AttendanceView({ ctx }) {
  const { isAdmin, sites, siteId, setSiteId, attendance, attAll, setAttAll, attendanceAll } = ctx;

  const showAll = isAdmin && attAll;
  const totalOn = attendanceAll.reduce((n, f) => n + f.onNow.length, 0);
  const totalStaff = attendanceAll.reduce((n, f) => n + f.totalStaff, 0);

  const personRow = (p) => (
    <View key={p.id} style={styles.shiftRow}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowMid}><View style={styles.onDot} /><Text style={styles.shiftName}> {p.firstName} {p.lastName}  </Text><CertChip value={p.certification} /></View>
        <Text style={styles.muted}>On since {fmtT(p.since)} · {fmtMins(p.minutes)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      {isAdmin && sites.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <TouchableOpacity style={[styles.siteChip, showAll && styles.siteChipOn]} onPress={() => setAttAll(true)}>
            <Text style={[styles.siteChipText, showAll && styles.siteChipTextOn]}>All homes</Text>
          </TouchableOpacity>
          {sites.map((st) => (
            <TouchableOpacity key={st.id} style={[styles.siteChip, !attAll && siteId === st.id && styles.siteChipOn]} onPress={() => { setAttAll(false); setSiteId(st.id); }}>
              <Text style={[styles.siteChipText, !attAll && siteId === st.id && styles.siteChipTextOn]}>{st.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={styles.cardTitle}>
        Who's clocked in · {showAll ? `${totalOn}/${totalStaff} across ${sites.length} homes` : `${attendance.onNow.length}/${attendance.totalStaff}`}
      </Text>
      {showAll ? (
        attendanceAll.length === 0 ? <Text style={styles.empty}>Loading homes…</Text> : attendanceAll.map((f) => (
          <View key={f.facilityId} style={{ marginTop: 10 }}>
            <Text style={{ fontWeight: "600", color: C.text, fontSize: 14 }}>{f.name} <Text style={styles.muted}>· {f.onNow.length} of {f.totalStaff} on now</Text></Text>
            {f.onNow.length === 0 ? <Text style={[styles.muted, { paddingVertical: 6 }]}>No one is clocked in right now.</Text> : f.onNow.map(personRow)}
          </View>
        ))
      ) : attendance.onNow.length === 0 ? (
        <Text style={styles.empty}>No one is clocked in right now.</Text>
      ) : attendance.onNow.map(personRow)}
    </View>
  );
}
