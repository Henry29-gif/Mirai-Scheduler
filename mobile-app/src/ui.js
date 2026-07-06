import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C, styles, ROLE_COLORS, CERT_COLORS, REASON } from "./theme";

export function Chip({ value, map }) {
  if (!value) return null;
  const c = (map || {})[value] || { bg: "#EEF1F5", fg: "#5B677A" };
  return <View style={[styles.chip, { backgroundColor: c.bg }]}><Text style={[styles.chipText, { color: c.fg }]}>{value}</Text></View>;
}
export const RoleChip = ({ value }) => <Chip value={value} map={ROLE_COLORS} />;
export const CertChip = ({ value }) => <Chip value={value} map={CERT_COLORS} />;
export function ReasonChip({ value }) {
  const m = { SICK: { bg: C.errorSoft, fg: C.error }, SWAP: { bg: C.warningSoft, fg: C.warning }, UNFILLED: { bg: "#EEF1F5", fg: C.text2 } }[value] || { bg: "#EEF1F5", fg: C.text2 };
  return <View style={[styles.chip, { backgroundColor: m.bg }]}><Text style={[styles.chipText, { color: m.fg }]}>{REASON[value] || "Open"}</Text></View>;
}

export function ThemeToggle({ theme, onToggle }) {
  return (
    <TouchableOpacity style={styles.themeToggle} onPress={onToggle}>
      <Text style={{ color: C.text2, fontSize: 16 }}>{theme === "dark" ? "☼" : "☾"}</Text>
    </TouchableOpacity>
  );
}
