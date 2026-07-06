import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, styles } from "../theme";
import { fmtDay, TO_STATUS } from "../format";

// My Space → "Request time off" (staff): pickers + request history.
export function TimeoffView({ ctx }) {
  const { toStart, toEnd, pickerFor, setPickerFor, onPickDate, toType, setToType, toReason, setToReason, submitTimeoff, busy, timeoff } = ctx;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Request time off</Text>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setPickerFor("start")}>
          <Text style={{ color: toStart ? C.text : C.text2, fontSize: 15 }}>{toStart ? fmtDay(toStart) : "From"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setPickerFor("end")}>
          <Text style={{ color: toEnd ? C.text : C.text2, fontSize: 15 }}>{toEnd ? fmtDay(toEnd) : "To"}</Text>
        </TouchableOpacity>
      </View>
      {pickerFor && (
        <DateTimePicker
          value={((pickerFor === "start" ? toStart : toEnd) ? new Date((pickerFor === "start" ? toStart : toEnd) + "T00:00:00") : new Date())}
          mode="date"
          onChange={onPickDate}
        />
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {["VACATION", "SICK", "PERSONAL", "UNPAID"].map((tp) => (
          <TouchableOpacity key={tp} style={[styles.typeChip, toType === tp && styles.typeChipOn]} onPress={() => setToType(tp)}>
            <Text style={[styles.typeChipText, toType === tp && styles.typeChipTextOn]}>{tp[0] + tp.slice(1).toLowerCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={styles.input} value={toReason} onChangeText={setToReason} placeholder="Reason (optional)" placeholderTextColor={C.text2} />
      <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={submitTimeoff} disabled={busy}><Text style={styles.btnText}>Submit request</Text></TouchableOpacity>
      {timeoff.map((t) => (
        <View key={t.id} style={styles.toItem}>
          <Text style={{ color: C.text, fontSize: 13 }}>{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · {t.type.toLowerCase()}</Text>
          <View style={[styles.chip, { backgroundColor: (TO_STATUS[t.status] || TO_STATUS.PENDING).bg }]}><Text style={[styles.chipText, { color: (TO_STATUS[t.status] || TO_STATUS.PENDING).fg }]}>{t.status[0] + t.status.slice(1).toLowerCase()}</Text></View>
        </View>
      ))}
    </View>
  );
}
