import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { API } from "../api";
import { C, styles } from "../theme";
import { fmtDay } from "../format";

// My Space → "Certification" (staff): licenses/certs with expiry pills + my own
// certification documents (private to me + my managers).
export function CertsView({ ctx }) {
  const {
    certForm, setCertForm, certExpPicker, setCertExpPicker, onCertExpPick,
    addCert, busy, msg, certs, certStatus, deleteCert,
    myDocs, downloadFile, deleteMyDoc, uploadMyDocs, docMsg,
  } = ctx;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Certification</Text>
      <Text style={[styles.muted, { marginBottom: 8 }]}>Your licenses &amp; credentials with expiry dates.</Text>
      <TextInput style={styles.input} value={certForm.name} onChangeText={(v) => setCertForm({ ...certForm, name: v })} placeholder="Name (e.g. RN License, CPR)" placeholderTextColor={C.text2} />
      <TextInput style={[styles.input, { marginTop: 8 }]} value={certForm.number} onChangeText={(v) => setCertForm({ ...certForm, number: v })} placeholder="Number (optional)" placeholderTextColor={C.text2} />
      <TouchableOpacity style={[styles.input, { marginTop: 8, justifyContent: "center" }]} onPress={() => setCertExpPicker(true)}>
        <Text style={{ color: certForm.expiryDate ? C.text : C.text2, fontSize: 15 }}>{certForm.expiryDate ? `Expires ${fmtDay(certForm.expiryDate)}` : "Expiry date (optional)"}</Text>
      </TouchableOpacity>
      {certExpPicker && <DateTimePicker value={certForm.expiryDate ? new Date(certForm.expiryDate + "T00:00:00") : new Date()} mode="date" onChange={onCertExpPick} />}
      <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={addCert} disabled={busy}><Text style={styles.btnText}>Add certification</Text></TouchableOpacity>
      {msg ? <Text style={styles.note}>{msg}</Text> : null}
      {certs.length === 0 ? <Text style={styles.empty}>No certifications yet.</Text> : certs.map((c) => {
        const st = certStatus(c.expiryDate);
        return (
          <View key={c.id} style={styles.shiftRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shiftName}>{c.name}</Text>
              <Text style={styles.muted}>{c.number ? c.number + " · " : ""}{c.expiryDate ? `Expires ${fmtDay(c.expiryDate)}` : "No expiry date"}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: st.color + "22" }]}><Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text></View>
            <TouchableOpacity onPress={() => deleteCert(c.id)}><Text style={[styles.linkDrop, { marginLeft: 10 }]}>Remove</Text></TouchableOpacity>
          </View>
        );
      })}
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: "600", color: C.text, marginBottom: 4 }}>Documents ({myDocs.length})</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>PDF copies of your licenses or certificates. Only you &amp; your managers can see these.</Text>
        {myDocs.length === 0 ? <Text style={styles.muted}>No documents yet.</Text> : myDocs.map((dc) => (
          <View key={dc.id} style={styles.tcRow}>
            <Text style={{ flex: 1, color: C.text, fontSize: 13 }} numberOfLines={1}>{dc.filename}</Text>
            <TouchableOpacity onPress={() => downloadFile(`${API}/api/my/documents/${dc.id}/download`, dc.filename)}><Text style={styles.linkTrade}>Open</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => deleteMyDoc(dc.id)}><Text style={[styles.linkDrop, { marginLeft: 12 }]}>Delete</Text></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={[styles.acceptBtnSm, { marginTop: 8, alignSelf: "flex-start" }]} onPress={uploadMyDocs}><Text style={styles.btnTextSm}>Upload PDFs</Text></TouchableOpacity>
        {docMsg ? <Text style={styles.note}>{docMsg}</Text> : null}
      </View>
    </View>
  );
}
