import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, styles } from "../theme";
import { fmtDay, fmtMins } from "../format";

// My Space → "Timecards" (manager/admin): facility timecards with per-day
// approval and missed-punch clock-out fix.
export function TimecardsView({ ctx }) {
  const { siteSwitcher, facTimecards, tcSel, setTcSel, reopenDay, approveDay, busy, setFixingDay, fixingDay, onFixTime, msg } = ctx;
  return (
    <View style={styles.card}>
      {siteSwitcher}
      <Text style={styles.cardTitle}>Timecards · last {facTimecards.rangeDays}d</Text>
      {facTimecards.staff.length === 0 ? <Text style={styles.empty}>No clock-ins in this period.</Text> : facTimecards.staff.map((s) => (
        <View key={s.userId} style={styles.tcStaff}>
          <TouchableOpacity onPress={() => setTcSel(tcSel === s.userId ? null : s.userId)}>
            <Text style={styles.shiftName}>{s.firstName} {s.lastName}  <Text style={styles.muted}>· {fmtMins(s.totalMinutes)} · {s.pendingDays ? `${s.pendingDays} to approve` : "all approved"}</Text></Text>
          </TouchableOpacity>
          {tcSel === s.userId && s.days.map((d) => (
            <View key={d.date} style={styles.tcRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 13 }}>{fmtDay(d.date)} · {fmtMins(d.minutes)}</Text>
                {d.missedPunch ? <Text style={{ color: C.warning, fontSize: 12 }}>Missed punch</Text> : null}
              </View>
              {d.approval
                ? <TouchableOpacity onPress={() => reopenDay(s.userId, d.date)}><Text style={styles.linkDrop}>Reopen</Text></TouchableOpacity>
                : <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => approveDay(s.userId, d.date)}><Text style={styles.btnTextSm}>Approve</Text></TouchableOpacity>}
              {d.missedPunch ? <TouchableOpacity onPress={() => setFixingDay({ userId: s.userId, date: d.date })}><Text style={[styles.linkTrade, { marginLeft: 12 }]}>Fix</Text></TouchableOpacity> : null}
            </View>
          ))}
        </View>
      ))}
      {fixingDay && <DateTimePicker value={new Date()} mode="time" onChange={onFixTime} />}
      {msg ? <Text style={styles.note}>{msg}</Text> : null}
    </View>
  );
}
