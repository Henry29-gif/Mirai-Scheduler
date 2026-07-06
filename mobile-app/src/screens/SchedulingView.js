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
    setSchedPickerFor, onSchedPick, scheduleDates, copyStaffingToAllDays, zeroDay, staffingVal,
    setStaffingCell, saveStaffing, generateRange, busy, msg, workload, postSchedule,
    shifts, openReassign, reassignFor, reassignCands, doReassign, callSick, drop,
    addShiftFor, openAddShift, closeAddShift, addShiftPicker, setAddShiftPicker, onAddShiftDatePick,
    addShiftSlot, pickAddShiftSlot, addShiftCert, pickAddShiftCert, addShiftCands, createAdhocShift,
    addShiftSearch, setAddShiftSearch,
  } = ctx;
  // Role chips + search filter the full staff list client-side.
  const visibleAddCands = (addShiftCands || []).filter((p) =>
    (addShiftCert === "All" || p.certification === addShiftCert) &&
    p.name.toLowerCase().includes(addShiftSearch.trim().toLowerCase()));
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
      <Text style={[styles.muted, { marginTop: 12, marginBottom: 8 }]}>How many of each role per shift, per date. Tap "Set to 0" when no staff are needed that day, or "Copy to all days" to fill the month, then Save &amp; Generate.</Text>
      {scheduleDates.map(({ dateStr, label }, i) => (
        <View key={dateStr} style={styles.staffDayBox}>
          <View style={styles.staffDayRow}>
            <Text style={styles.staffDayLabel}>{label}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              {i === 0 ? <TouchableOpacity onPress={() => copyStaffingToAllDays(dateStr)}><Text style={styles.linkTrade}>Copy to all days</Text></TouchableOpacity> : null}
              <TouchableOpacity onPress={() => zeroDay(dateStr)}><Text style={styles.linkDrop}>Set to 0</Text></TouchableOpacity>
            </View>
          </View>
          <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 }}>
            <View style={styles.gridRow}>
              <Text style={styles.gridLabel}></Text>
              {["RN", "LPN", "CCA"].map((c) => <Text key={c} style={styles.gridHeadCell}>{c}</Text>)}
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
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Schedule · {monthName}</Text>
        <TouchableOpacity style={styles.acceptBtnSm} onPress={openAddShift}><Text style={styles.btnTextSm}>Add shift</Text></TouchableOpacity>
      </View>

      {addShiftFor && (
        <View style={[styles.tradePanel, { marginTop: 4 }]}>
          <TouchableOpacity style={[styles.input, { justifyContent: "center" }]} onPress={() => setAddShiftPicker(true)}>
            <Text style={{ color: C.text, fontSize: 15 }}>{fmtDay(addShiftFor)}</Text>
          </TouchableOpacity>
          {addShiftPicker && <DateTimePicker value={new Date(addShiftFor + "T00:00:00")} mode="date" onChange={onAddShiftDatePick} />}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {["Day", "Evening", "Night"].map((s) => (
              <TouchableOpacity key={s} style={[styles.typeChip, addShiftSlot === s && styles.typeChipOn]} onPress={() => pickAddShiftSlot(s)}>
                <Text style={[styles.typeChipText, addShiftSlot === s && styles.typeChipTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {["All", "RN", "LPN", "CCA"].map((c) => (
              <TouchableOpacity key={c} style={[styles.typeChip, addShiftCert === c && styles.typeChipOn]} onPress={() => pickAddShiftCert(c)}>
                <Text style={[styles.typeChipText, addShiftCert === c && styles.typeChipTextOn]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 8 }]} value={addShiftSearch} onChangeText={setAddShiftSearch}
            placeholder="Search staff by name…" placeholderTextColor={C.text2} autoCapitalize="none"
          />
          {addShiftCands === null ? <Text style={[styles.muted, { marginTop: 8 }]}>Loading your staff…</Text>
            : visibleAddCands.length === 0 ? <Text style={[styles.muted, { marginTop: 8 }]}>No one matches.</Text>
            : visibleAddCands.map((p) => (
              <View key={p.id} style={[styles.tradeOffer, !p.eligible && { opacity: 0.5 }]}>
                <View style={styles.rowMid}><CertChip value={p.certification} /></View>
                <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{p.name} · {p.weeklyHours}h{!p.eligible ? " · needs 8h rest" : p.wouldBeOvertime ? " · OT" : ""}{p.eligible && p.shiftCost != null ? ` · $${p.shiftCost}` : ""}</Text>
                {p.eligible && <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => createAdhocShift(p.id, p.certification)}><Text style={styles.btnTextSm}>Assign</Text></TouchableOpacity>}
              </View>
            ))}
          <View style={{ flexDirection: "row", gap: 18, marginTop: 10 }}>
            {addShiftCert !== "All" && (
              <TouchableOpacity disabled={busy} onPress={() => createAdhocShift(null, addShiftCert)}><Text style={styles.linkTrade}>Post as open {addShiftCert} shift</Text></TouchableOpacity>
            )}
            <TouchableOpacity onPress={closeAddShift}><Text style={styles.linkDrop}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {shifts.length === 0 ? <Text style={styles.empty}>No shifts yet — generate above, or add a single shift.</Text> : shifts.slice(0, 40).map((s) => (
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
