import React from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, styles } from "../theme";
import { CertChip } from "../ui";
import { fmtT, fmtD, fmtDay } from "../format";

// My Space → "Staffing & schedule" (manager/admin): per-date staffing grid,
// date-range generate, distribution preview + post, and per-shift reassign.
export function SchedulingView({ ctx }) {
  const {
    siteSwitcher, currentSiteName, monthNav, monthName, schedRange, schedPickerFor,
    setSchedPickerFor, onSchedPick, scheduleDates, copyStaffingToAllDays, staffingVal,
    setStaffingCell, saveStaffing, generateRange, busy, msg, workload, postSchedule,
    shifts, openReassign, reassignFor, reassignCands, doReassign, callSick, drop,
  } = ctx;
  return (<>
    <View style={styles.card}>
      {siteSwitcher}
      <Text style={styles.cardTitle}>Staffing needs{currentSiteName ? ` · ${currentSiteName}` : ""}</Text>
      <View style={{ marginBottom: 10 }}>{monthNav}</View>
      <Text style={styles.label}>Schedule dates</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setSchedPickerFor("start")}><Text style={{ color: C.text, fontSize: 15 }}>{fmtDay(schedRange.start)}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setSchedPickerFor("end")}><Text style={{ color: C.text, fontSize: 15 }}>{fmtDay(schedRange.end)}</Text></TouchableOpacity>
      </View>
      {schedPickerFor && (
        <DateTimePicker value={new Date((schedPickerFor === "start" ? schedRange.start : schedRange.end) + "T00:00:00")} mode="date" onChange={onSchedPick} />
      )}
      <Text style={[styles.muted, { marginTop: 12, marginBottom: 8 }]}>How many of each role per shift, per date. 0 = none. Use "Copy to all days" to fill the month, then Save &amp; Generate.</Text>
      <View style={styles.gridRow}>
        <Text style={styles.gridLabel}></Text>
        {["RN", "LPN", "CCA"].map((c) => <Text key={c} style={styles.gridHeadCell}>{c}</Text>)}
      </View>
      {scheduleDates.map(({ dateStr, label }, i) => (
        <View key={dateStr}>
          <View style={styles.staffDayRow}>
            <Text style={styles.staffDayLabel}>{label}</Text>
            {i === 0 ? <TouchableOpacity onPress={() => copyStaffingToAllDays(dateStr)}><Text style={styles.linkTrade}>Copy to all days</Text></TouchableOpacity> : null}
          </View>
          {["Day", "Evening", "Night"].map((shift) => (
            <View key={shift} style={styles.gridRow}>
              <Text style={styles.gridLabel}>{shift}</Text>
              {["RN", "LPN", "CCA"].map((cert) => (
                <TextInput key={cert} style={styles.gridInput} keyboardType="number-pad" value={staffingVal(dateStr, shift, cert)} onChangeText={(v) => setStaffingCell(dateStr, shift, cert, v)} />
              ))}
            </View>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btn, { flex: 1, marginTop: 0 }]} onPress={saveStaffing} disabled={busy}><Text style={styles.btnText}>Save needs</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { flex: 1, marginTop: 0 }]} onPress={generateRange} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate</Text>}</TouchableOpacity>
      </View>
      {msg ? <Text style={styles.note}>{msg}</Text> : null}
    </View>

    {workload.staff.length > 0 && (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Distribution preview</Text>
          <View style={[styles.chip, { backgroundColor: workload.status === "PUBLISHED" ? C.successSoft : C.warningSoft }]}><Text style={[styles.chipText, { color: workload.status === "PUBLISHED" ? C.success : C.warning }]}>{workload.status === "PUBLISHED" ? "Posted" : "Draft"}</Text></View>
        </View>
        <Text style={[styles.muted, { marginBottom: 6 }]}>{workload.summary.totalAssigned} assigned · {workload.summary.openShifts} open · spread {workload.summary.min}–{workload.summary.max}/person</Text>
        {workload.staff.map((s) => (
          <View key={s.userId} style={styles.sdRow}><Text style={{ color: C.text, fontSize: 13 }}>{s.firstName} {s.lastName}</Text><Text style={styles.muted}>{s.shiftCount} shifts · {s.hours}h</Text></View>
        ))}
        {workload.status !== "PUBLISHED" && <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={postSchedule} disabled={busy}><Text style={styles.btnText}>Post schedule</Text></TouchableOpacity>}
      </View>
    )}

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Schedule · {monthName}</Text>
      {shifts.length === 0 ? <Text style={styles.empty}>No shifts yet — generate above.</Text> : shifts.slice(0, 40).map((s) => (
        <View key={s.id}>
          <View style={styles.shiftRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.rowMid}><CertChip value={s.requiredCertification} /><Text style={styles.shiftName}>  {s.staff?.firstName} {s.staff?.lastName}</Text></View>
              <Text style={styles.muted}>{fmtD(s.startTime)} · {fmtT(s.startTime)}–{fmtT(s.endTime)} · {s.unit?.name}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <TouchableOpacity onPress={() => openReassign(s.id)}><Text style={styles.linkTrade}>{reassignFor === s.id ? "Close" : "Reassign"}</Text></TouchableOpacity>
              <View style={styles.rowMid}>
                <TouchableOpacity onPress={() => callSick(s.id)}><Text style={styles.linkSick}>Sick </Text></TouchableOpacity>
                <TouchableOpacity onPress={() => drop(s.id)}><Text style={styles.linkDrop}>Drop</Text></TouchableOpacity>
              </View>
            </View>
          </View>
          {reassignFor === s.id && (
            <View style={styles.tradePanel}>
              {reassignCands === null ? <Text style={styles.muted}>Loading eligible coworkers…</Text> : reassignCands.length === 0 ? <Text style={styles.muted}>No eligible coworker (cert + 8h rest).</Text> : (
                <>
                  <Text style={[styles.muted, { marginBottom: 4 }]}>Move this shift to:</Text>
                  {reassignCands.map((c) => (
                    <TouchableOpacity key={c.id} style={styles.tradeOffer} onPress={() => doReassign(s.id, c.id)}>
                      <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{c.name} · {c.weeklyHours}h{c.wouldBeOvertime ? " · OT" : ""}</Text>
                      <View style={styles.acceptBtnSm}><Text style={styles.btnTextSm}>Move</Text></View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>
          )}
        </View>
      ))}
    </View>
  </>);
}
