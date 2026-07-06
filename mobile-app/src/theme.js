import { StyleSheet, Platform } from "react-native";

// Design system palette — light + dark
export const LIGHT = {
  bg: "#F4F6FB", surface: "#FFFFFF", surface2: "#F8FAFE",
  text: "#1B2440", text2: "#647089",
  brand: "#3A5BDC", accent: "#15B8A6", accentSoft: "#E4F7F4",
  coral: "#EF7448", coralSoft: "#FDEBE3",
  success: "#2BA46F", successSoft: "#E5F5EC",
  warning: "#C9881F", warningSoft: "#FCF3E0",
  error: "#E25563", errorSoft: "#FCEBEE",
  border: "#E4E8F2", borderInput: "#D7DDEA",
};
export const DARK = {
  bg: "#0E1424", surface: "#161E33", surface2: "#121A2E",
  text: "#E8EDF7", text2: "#9FB0C9",
  brand: "#2E4AB0", accent: "#2BD0BE", accentSoft: "#103029",
  coral: "#FB8C66", coralSoft: "#3A2419",
  success: "#46C892", successSoft: "#102A20",
  warning: "#E6B45A", warningSoft: "#2C2415",
  error: "#EF7A86", errorSoft: "#2E1A1D",
  border: "#243352", borderInput: "#2C3C5C",
};

export const ROLE_COLORS = {
  ADMIN: { bg: "#EAEEFB", fg: "#2C46B8" },
  MANAGER: { bg: "#E4F7F4", fg: "#0E7E72" },
  STAFF: { bg: "#EEF1F6", fg: "#647089" },
};
export const CERT_COLORS = {
  RN: { bg: "#EAEEFB", fg: "#2C46B8" },
  LPN: { bg: "#E4F7F4", fg: "#0E7E72" },
  CCA: { bg: "#FDEBE3", fg: "#B0512B" },
};
export const REASON = { SICK: "Sick call-in", SWAP: "Dropped", UNFILLED: "Open" };

const makeStyles = (C) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  themeToggle: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  loginTheme: { position: "absolute", top: 20, right: 20, zIndex: 10 },
  muted: { color: C.text2, fontSize: 13 },

  loginWrap: { flex: 1, backgroundColor: C.brand, justifyContent: "center", padding: 24 },
  loginCard: { backgroundColor: C.surface, borderRadius: 12, padding: 24, maxWidth: 420, width: "100%", alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  mark: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  markSm: { width: 26, height: 26, borderRadius: 7, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  markText: { color: "#fff", fontWeight: "600", fontSize: 18 },
  markTextSm: { color: "#fff", fontWeight: "600", fontSize: 15 },
  brandTitle: { fontSize: 22, fontWeight: "700", color: C.text, letterSpacing: -0.2 },
  label: { fontWeight: "500", fontSize: 13, marginTop: 16, marginBottom: 6, color: C.text },
  input: { borderWidth: 1, borderColor: C.borderInput, borderRadius: 10, height: 44, paddingHorizontal: 14, fontSize: 15, color: C.text },
  btn: { backgroundColor: C.accent, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  btnTextSm: { color: "#fff", fontWeight: "600", fontSize: 13 },
  hint: { color: C.text2, fontSize: 13, marginTop: 16 },
  linkBtn: { color: C.accent, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 14 },
  error: { color: C.error, backgroundColor: C.errorSoft, padding: 10, borderRadius: 10, marginTop: 14 },
  note: { color: C.success, backgroundColor: C.successSoft, padding: 10, borderRadius: 10, marginTop: 12 },
  dangerZone: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  dangerTitle: { fontSize: 15, fontWeight: "600", color: C.error, marginBottom: 2 },
  btnDanger: { marginTop: 12, borderWidth: 1, borderColor: C.error, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  btnDangerText: { color: C.error, fontWeight: "600", fontSize: 14 },

  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 16, paddingTop: Platform.OS === "android" ? 38 : 16, borderBottomWidth: 1, borderBottomColor: C.border },
  topTitle: { fontWeight: "600", fontSize: 16, color: C.text },
  signout: { color: C.accent, fontWeight: "600" },
  scroll: { padding: 16, paddingBottom: 80, gap: 16 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 58, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  bottomItem: { paddingHorizontal: 26, paddingVertical: 9, borderRadius: 10 },
  bottomItemText: { fontSize: 14, fontWeight: "500", color: C.text2 },
  bottomItemActive: { color: C.accent },
  myspaceMenu: { position: "absolute", bottom: 66, right: 18, width: 220, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: "hidden", zIndex: 50, elevation: 6 },
  myspaceLink: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 16, marginTop: 10 },
  myspaceLinkTitle: { fontSize: 15, fontWeight: "500", color: C.text },
  clockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  clockState: { fontSize: 17, fontWeight: "600" },
  clockBtn: { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 13, justifyContent: "center" },
  tcDay: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },

  card: { backgroundColor: C.surface, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: C.border },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardTitle: { fontWeight: "600", fontSize: 16, color: C.text, marginBottom: 8, letterSpacing: -0.2 },
  welcome: { fontSize: 18, fontWeight: "600", marginBottom: 8, color: C.text, letterSpacing: -0.2 },
  rowMid: { flexDirection: "row", alignItems: "center" },

  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, marginRight: 4 },
  chipText: { fontWeight: "500", fontSize: 11 },
  siteChip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.surface2 },
  siteChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  siteChipText: { color: C.text, fontSize: 13, fontWeight: "500" },
  siteChipTextOn: { color: "#fff" },
  staffDetail: { backgroundColor: C.surface2, borderRadius: 10, padding: 12, marginBottom: 10 },
  sdRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border },
  sdVal: { color: C.text, fontWeight: "600", fontSize: 13 },
  onDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: C.success },
  gridRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  gridLabel: { width: 70, color: C.text, fontWeight: "500", fontSize: 14 },
  gridHeadCell: { flex: 1, textAlign: "center", color: C.text2, fontSize: 12, fontWeight: "600" },
  gridInput: { flex: 1, marginHorizontal: 4, borderWidth: 1, borderColor: C.borderInput, borderRadius: 8, height: 42, textAlign: "center", fontSize: 16, color: C.text },
  staffDayBox: { borderWidth: 1, borderColor: C.border, borderRadius: 10, marginTop: 12, overflow: "hidden" },
  staffDayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.accentSoft, paddingHorizontal: 10, paddingVertical: 8 },
  staffDayLabel: { fontWeight: "700", color: C.text, fontSize: 14 },
  staffDates: { color: C.text2, fontSize: 12, marginTop: 6 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthNavBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  monthNavLabel: { fontWeight: "600", color: C.text, fontSize: 15 },
  tcStaff: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 10 },
  tcRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingLeft: 8 },

  btnSm: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }, // matches acceptBtnSm so side-by-side small buttons align
  acceptBtn: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, justifyContent: "center" },
  acceptBtnSm: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  declineBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, justifyContent: "center" },
  empty: { textAlign: "center", color: C.text2, paddingVertical: 18 },
  shiftRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  shiftName: { fontWeight: "500", color: C.text },
  linkTrade: { color: C.accent, fontWeight: "600", fontSize: 13, paddingVertical: 2 },
  linkSick: { color: C.error, fontWeight: "600", fontSize: 13, paddingVertical: 2 },
  linkDrop: { color: C.warning, fontWeight: "600", fontSize: 13, paddingVertical: 2 },

  tradePanel: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  tradeMine: { backgroundColor: C.accentSoft, color: C.brand, padding: 8, borderRadius: 8, fontSize: 13, fontWeight: "500" },
  tradeCoworker: { fontWeight: "600", color: C.text, marginBottom: 4 },
  tradeOffer: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  tradeIncoming: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  tradeFrom: { fontWeight: "600", color: C.text, marginBottom: 6 },
  leg: { padding: 6, borderRadius: 6, marginBottom: 4 },
  tradeBtns: { flexDirection: "row", gap: 8, marginTop: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.borderInput, backgroundColor: C.surface },
  typeChipOn: { backgroundColor: C.accentSoft, borderColor: C.accent },
  typeChipText: { fontSize: 13, color: C.text2, fontWeight: "500" },
  typeChipTextOn: { color: C.accent },
  toItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, marginTop: 6 },
  toApproval: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.border },
  availRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  availDayLabel: { width: 38, fontSize: 13, fontWeight: "500", color: C.text },
  availColLabel: { flex: 1, textAlign: "center", fontSize: 12, color: C.text2, fontWeight: "500" },
  availCell: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 8 },
  notifDot: { position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 999, backgroundColor: C.error, alignItems: "center", justifyContent: "center" },
  notifDotText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  notifItem: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 2 },
  notifTitle: { fontWeight: "500", color: C.text, fontSize: 14 },
  notifActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  notifBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  notifAccept: { backgroundColor: C.accent },
  notifAcceptTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  notifDecline: { borderWidth: 1, borderColor: C.border },
  notifDeclineTxt: { color: C.text2, fontWeight: "700", fontSize: 13 },
  notifActed: { marginTop: 8, fontWeight: "700", fontSize: 13, color: C.accent },
  moreItem: { paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
});

// Current palette + stylesheet — live module bindings, reassigned by <App> via
// applyTheme() when the theme changes (same semantics as the old module `let`s;
// screens must reference `C.x` / `styles.x` through the import, not destructure
// them at module scope).
export let C = LIGHT;
export let styles = makeStyles(C);
let currentTheme = "light";
export function applyTheme(theme) {
  if (theme === currentTheme) return;
  currentTheme = theme;
  C = theme === "dark" ? DARK : LIGHT;
  styles = makeStyles(C);
}
