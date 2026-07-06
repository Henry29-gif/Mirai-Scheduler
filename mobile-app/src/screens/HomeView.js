import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C, styles } from "../theme";
import { RoleChip, CertChip, ReasonChip } from "../ui";
import { fmtT, fmtD, fmtMins } from "../format";

// Home: site switcher + month nav (admin), welcome, time clock (staff),
// incoming trades, the open-shift board, and "My shifts" with the trade panel.
export function HomeView({ ctx }) {
  const {
    user, me, isManager, isAdmin, myCert, msg, sites, siteSwitcher, monthNav,
    monthName, clock, toggleClock, busy, incoming, respond, grabbable, accept,
    shifts, openTrade, tradeFor, tradeOpts, proposeTrade, drop,
  } = ctx;

  return (<>
    {isAdmin && sites.length > 0 && (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Site</Text>
        {siteSwitcher}
      </View>
    )}
    <View style={[styles.card, { paddingVertical: 10 }]}>{monthNav}</View>
    <View style={styles.card}>
      <Text style={styles.welcome}>Welcome, {user.firstName}</Text>
      <View style={styles.rowMid}>
        <RoleChip value={user.role} />
        <CertChip value={myCert} />
        <Text style={styles.muted}>  {user.firstName} {user.lastName}</Text>
      </View>
      {msg ? <Text style={styles.note}>{msg}</Text> : null}
    </View>

    {!isManager && (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Time clock</Text>
        <View style={styles.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clockState, { color: clock.clockedIn ? C.success : C.text2 }]}>{clock.clockedIn ? "Clocked in" : "Clocked out"}</Text>
            <Text style={styles.muted}>{clock.clockedIn ? `Since ${fmtT(clock.since)} · ` : ""}Today: {fmtMins(clock.todayMinutes)}</Text>
          </View>
          <TouchableOpacity style={[styles.clockBtn, { backgroundColor: clock.clockedIn ? C.error : C.accent }]} disabled={busy} onPress={toggleClock}>
            <Text style={styles.btnText}>{clock.clockedIn ? "Clock out" : "Clock in"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}

    {incoming.length > 0 && (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Incoming trade requests ({incoming.length})</Text>
        {incoming.map((sw) => (
          <View key={sw.id} style={styles.tradeIncoming}>
            <Text style={styles.tradeFrom}>{sw.requestor.firstName} {sw.requestor.lastName} wants to trade</Text>
            <View style={[styles.leg, { backgroundColor: C.successSoft }]}><Text style={{ color: C.success, fontSize: 13 }}>You'd work: {fmtD(sw.originalShift.startTime)}, {fmtT(sw.originalShift.startTime)}–{fmtT(sw.originalShift.endTime)}</Text></View>
          <View style={[styles.leg, { backgroundColor: C.warningSoft }]}><Text style={{ color: C.warning, fontSize: 13 }}>They'd take: {fmtD(sw.offeredShift.startTime)}, {fmtT(sw.offeredShift.startTime)}–{fmtT(sw.offeredShift.endTime)}</Text></View>
            <View style={styles.tradeBtns}>
              <TouchableOpacity style={styles.acceptBtn} disabled={busy} onPress={() => respond(sw.id, true)}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} disabled={busy} onPress={() => respond(sw.id, false)}><Text style={{ color: C.brand, fontWeight: "600" }}>Decline</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    )}

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Available shifts {grabbable.length ? `(${grabbable.length})` : ""}</Text>
      {grabbable.length === 0 ? (
        <Text style={styles.empty}>No open shifts you can take right now.</Text>
      ) : grabbable.slice(0, 15).map((s) => (
        <View key={s.id} style={styles.shiftRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowMid}><CertChip value={s.requiredCertification} /><ReasonChip value={s.openReason} /></View>
            <Text style={styles.muted}>{fmtD(s.startTime)} · {fmtT(s.startTime)}–{fmtT(s.endTime)} · {s.unit?.name}</Text>
          </View>
          {!isManager && <TouchableOpacity style={styles.acceptBtn} disabled={busy} onPress={() => accept(s.id)}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>}
        </View>
      ))}
    </View>

    {!isManager && (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>My shifts · {monthName}</Text>

      {shifts.length === 0 ? (
        <Text style={styles.empty}>No shifts scheduled yet.</Text>
      ) : shifts.slice(0, 20).map((s) => {
        const mine = s.staff?.id === (me?.id || user.id);
        return (
          <View key={s.id}>
            <View style={styles.shiftRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowMid}><CertChip value={s.requiredCertification} /><Text style={styles.shiftName}>  {s.staff?.firstName} {s.staff?.lastName}{mine ? " (you)" : ""}</Text></View>
                <Text style={styles.muted}>{fmtD(s.startTime)} · {fmtT(s.startTime)}–{fmtT(s.endTime)} · {s.unit?.name}</Text>
              </View>
              {mine && (
                <View style={{ alignItems: "flex-end" }}>
                  <TouchableOpacity onPress={() => openTrade(s.id)}><Text style={styles.linkTrade}>{tradeFor === s.id ? "Close" : "Trade"}</Text></TouchableOpacity>
                  <View style={styles.rowMid}>
                    <TouchableOpacity onPress={() => drop(s.id)}><Text style={styles.linkDrop}>Drop</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {tradeFor === s.id && (
              <View style={styles.tradePanel}>
                {!tradeOpts ? <Text style={styles.muted}>Loading coworkers…</Text> : (
                  <>
                    <Text style={styles.tradeMine}>You give up: {fmtD(tradeOpts.myShift.startTime)}, {fmtT(tradeOpts.myShift.startTime)}–{fmtT(tradeOpts.myShift.endTime)}</Text>
                    {tradeOpts.coworkers.length === 0 ? <Text style={styles.muted}>No rest-compatible coworker shifts to trade for.</Text> :
                      tradeOpts.coworkers.map((c) => (
                        <View key={c.id} style={{ marginTop: 8 }}>
                          <Text style={styles.tradeCoworker}>{c.name}</Text>
                          {c.shifts.map((os) => (
                            <View key={os.id} style={styles.tradeOffer}>
                              <Text style={{ flex: 1, fontSize: 13, color: C.text }}>You'd work: {fmtD(os.startTime)}, {fmtT(os.startTime)}–{fmtT(os.endTime)}</Text>
                              <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => proposeTrade(os.id)}><Text style={styles.btnTextSm}>Request</Text></TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      ))}
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
    )}
  </>);
}
