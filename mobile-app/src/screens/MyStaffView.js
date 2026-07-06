import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { API } from "../api";
import { C, styles } from "../theme";
import { CertChip } from "../ui";
import { fmtDay } from "../format";

// My Space → "My Staff" (admin): roster metrics, tap-to-expand detail with
// certifications + HR documents (upload / open / merged download / delete).
export function MyStaffView({ ctx }) {
  const {
    siteSwitcher, sites, siteId, monthNav, monthName, roster, staffSel, setStaffSel,
    setDocMsg, loadStaffDocs, loadStaffCerts, money, relColor, staffDocs, staffCerts,
    certStatus, downloadFile, deleteDoc, uploadDocs, docMsg,
  } = ctx;
  return (
    <View style={styles.card}>
      {siteSwitcher}
      <Text style={styles.cardTitle}>My Staff{sites.find((s) => s.id === siteId) ? ` · ${sites.find((s) => s.id === siteId).name}` : ""}</Text>
      <View style={{ marginBottom: 10 }}>{monthNav}</View>
      {roster.length === 0 ? <Text style={styles.empty}>No staff at this site.</Text> : roster.map((s) => (
        <View key={s.userId}>
          <TouchableOpacity style={styles.shiftRow} onPress={() => { const open = staffSel === s.userId; setStaffSel(open ? null : s.userId); if (!open) { setDocMsg(""); loadStaffDocs(s.userId); loadStaffCerts(s.userId); } }}>
            <View style={{ flex: 1 }}>
              <View style={styles.rowMid}><Text style={styles.shiftName}>{s.firstName} {s.lastName}  </Text><CertChip value={s.certification} /></View>
              <Text style={styles.muted}>{s.shiftsWorked}/{s.shiftsScheduledPast} shifts · {s.attendancePct == null ? "—" : s.attendancePct + "%"} · {money(s.pay)}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: relColor(s.reliabilityLabel) + "22" }]}><Text style={[styles.chipText, { color: relColor(s.reliabilityLabel) }]}>{s.reliabilityLabel}</Text></View>
          </TouchableOpacity>
          {staffSel === s.userId && (
            <View style={styles.staffDetail}>
              {[
                ["Shifts worked / scheduled", `${s.shiftsWorked} / ${s.shiftsScheduledPast}`],
                ["Attendance", s.attendancePct == null ? "—" : s.attendancePct + "%"],
                ["On-time", (s.punctualityPct == null ? "—" : s.punctualityPct + "%") + ` · ${s.lateCount} late`],
                ["Call-ins (sick)", String(s.callIns)],
                [`${monthName} pay · ${s.payHours}h`, money(s.pay)],
                ["Reliability", s.reliabilityScore == null ? "—" : `${s.reliabilityScore} · ${s.reliabilityLabel}`],
                ["Documents", String(staffDocs.length)],
              ].map(([k, v]) => (
                <View key={k} style={styles.sdRow}><Text style={styles.muted}>{k}</Text><Text style={styles.sdVal}>{v}</Text></View>
              ))}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: "600", color: C.text, marginBottom: 6 }}>Certifications ({staffCerts.length})</Text>
                {staffCerts.length === 0 ? <Text style={styles.muted}>None recorded.</Text> : staffCerts.map((c) => {
                  const st = certStatus(c.expiryDate);
                  return (
                    <View key={c.id} style={styles.tcRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontSize: 13 }}>{c.name}{c.number ? ` · ${c.number}` : ""}</Text>
                        <Text style={styles.muted}>{c.expiryDate ? `exp ${fmtDay(c.expiryDate)}` : "no expiry"}</Text>
                      </View>
                      <View style={[styles.chip, { backgroundColor: st.color + "22" }]}><Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text></View>
                    </View>
                  );
                })}
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: "600", color: C.text, marginBottom: 6 }}>Documents ({staffDocs.length})</Text>
                {staffDocs.length === 0 ? <Text style={styles.muted}>No files yet.</Text> : staffDocs.map((dc) => (
                  <View key={dc.id} style={styles.tcRow}>
                    <Text style={{ flex: 1, color: C.text, fontSize: 13 }} numberOfLines={1}>{dc.filename}</Text>
                    <View style={[styles.chip, { backgroundColor: (dc.source === "STAFF" ? C.accent : C.text2) + "22", marginRight: 10 }]}><Text style={[styles.chipText, { color: dc.source === "STAFF" ? C.accent : C.text2 }]}>{dc.source === "STAFF" ? "Staff" : "Admin"}</Text></View>
                    <TouchableOpacity onPress={() => downloadFile(`${API}/api/staff/${s.userId}/documents/${dc.id}/download`, dc.filename)}><Text style={styles.linkTrade}>Open</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteDoc(s.userId, dc.id)}><Text style={[styles.linkDrop, { marginLeft: 12 }]}>Delete</Text></TouchableOpacity>
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={styles.acceptBtnSm} onPress={() => uploadDocs(s.userId)}><Text style={styles.btnTextSm}>Upload PDFs</Text></TouchableOpacity>
                  {staffDocs.length > 0 && <TouchableOpacity style={styles.btnSm} onPress={() => downloadFile(`${API}/api/staff/${s.userId}/documents/merged`, `${s.firstName}_${s.lastName}_documents.pdf`)}><Text style={styles.btnText}>Download all</Text></TouchableOpacity>}
                </View>
                {docMsg ? <Text style={styles.note}>{docMsg}</Text> : null}
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
