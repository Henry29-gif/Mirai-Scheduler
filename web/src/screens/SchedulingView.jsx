import React from "react";
import { Cert } from "../ui";
import { fmtDateTime } from "../format";
import { Toolbar } from "../components/Toolbar";

// My Space → "Staffing needs and schedule" (managers/admins): per-date staffing
// grid, generate, distribution preview, and the drag-and-drop draft calendar.
export function SchedulingView({ ctx }) {
  const {
    currentSite, monthFirst, monthLast, schedRange, setSchedRange, scheduleDates,
    copyStaffingToAllDays, zeroDay, staffingVal, setStaffingCell, stepStaffingCell, saveStaffing, staffingBusy,
    staffingMsg, generate, busy, workload, schedule, period, monthName, schedulePeriod,
    calView, setCalView, calWeek, setCalWeek, dragId, setDragId, dropId, setDropId,
    onChipDragStart, onChipDrop, postSchedule, scheduleMsg,
    addShiftFor, openAddShift, closeAddShift, addSlot, pickAddSlot, addShiftCert, pickAddCert,
    addCands, addSearch, setAddSearch, addMsg, createAdhocShift,
  } = ctx;
  const dateOf = (dayNum) => `${period.year}-${String(period.month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
  // Role chips + search filter the full staff list client-side.
  const visibleCands = (addCands || []).filter((c) =>
    (addShiftCert === "All" || c.certification === addShiftCert) &&
    c.name.toLowerCase().includes(addSearch.trim().toLowerCase()));

  // Manager-only staffing-needs grid.
  const staffingCard = (
    <section className="card span2">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h2>Staffing needs <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {currentSite ? currentSite.name : "this site"}</span></h2>
      </div>
      <div className="sched-dates" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
        <span className="muted">Schedule these dates:</span>
        <label>From <input type="date" min={monthFirst} max={monthLast} value={schedRange.start} onChange={(e) => setSchedRange((r) => ({ ...r, start: e.target.value }))} /></label>
        <label>To <input type="date" min={schedRange.start || monthFirst} max={monthLast} value={schedRange.end} onChange={(e) => setSchedRange((r) => ({ ...r, end: e.target.value }))} /></label>
        <span className="muted" style={{ fontSize: 12 }}>(defaults to the whole month)</span>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
        Set how many staff you need for each shift <strong>on each date</strong>, then click <strong>Generate schedule</strong> — it fills these automatically. Use <strong>Set day to 0</strong> when no staff are needed that day, or <strong>Copy to all days</strong> to apply the first date to the whole month.
      </p>
      <div className="staffing-days-grid">
        {scheduleDates.map(({ dateStr, label }, i) => (
          <div className="staffing-day-box" key={dateStr}>
            <div className="staffing-day-head">
              <span className="staffing-day-title">{label}</span>
              <div className="staffing-day-actions">
                {i === 0 && <button type="button" className="btn-ghost sm" onClick={() => copyStaffingToAllDays(dateStr)}>Copy to all days</button>}
                <button type="button" className="btn-ghost sm" title="No staff needed this day" onClick={() => zeroDay(dateStr)}>Set day to 0</button>
              </div>
            </div>
            <table className="tbl staffing-grid">
              <thead><tr><th>Shift</th><th>RN</th><th>LPN</th><th>CCA</th></tr></thead>
              <tbody>
                {["Day", "Evening", "Night"].map((shift) => (
                  <tr key={shift}>
                    <td className="staffing-shift">{shift}</td>
                    {["RN", "LPN", "CCA"].map((cert) => (
                      <td key={cert}>
                        <div className="stepper">
                          <button type="button" className="stepper-btn" aria-label={`fewer ${cert} on ${label} ${shift}`} onClick={() => stepStaffingCell(dateStr, shift, cert, -1)}>−</button>
                          <input type="number" min="0" max="20" className="staffing-input" value={staffingVal(dateStr, shift, cert)} onChange={(e) => setStaffingCell(dateStr, shift, cert, e.target.value)} aria-label={`${label} ${shift} ${cert} count`} />
                          <button type="button" className="stepper-btn" aria-label={`more ${cert} on ${label} ${shift}`} onClick={() => stepStaffingCell(dateStr, shift, cert, 1)}>+</button>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button className="btn-ghost" style={{ width: "auto", marginTop: 0 }} onClick={saveStaffing} disabled={staffingBusy}>{staffingBusy ? "Saving…" : "Save needs"}</button>
        <button className="btn" style={{ width: "auto", marginTop: 0 }} onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate schedule"}</button>
      </div>
      {staffingMsg && <div className="note">{staffingMsg}</div>}
    </section>
  );

  // Manager-only distribution preview (per-person workload + last shift).
  const distributionCard = workload.staff.length > 0 ? (
    <section className="card span2">
      <div className="card-head">
        <h2>Distribution preview <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· review before you post</span></h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {workload.summary.totalAssigned} assigned · {workload.summary.openShifts} open · spread {workload.summary.min}–{workload.summary.max} shifts/person
        </span>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: 13 }}>
        How evenly the draft is spread. Use <strong>Reassign</strong> in the schedule below to move a shift to a lighter coworker, then <strong>Post schedule</strong>.
      </p>
      <table className="tbl">
        <thead><tr><th>Staff</th><th>Cert</th><th>Shifts</th><th>Hours</th><th>Last shift</th></tr></thead>
        <tbody>
          {workload.staff.map((s) => {
            const spread = workload.summary.max !== workload.summary.min;
            const cls = spread && s.shiftCount === workload.summary.max ? "hi" : spread && s.shiftCount === workload.summary.min ? "lo" : "";
            return (
              <tr key={s.userId}>
                <td>{s.firstName} {s.lastName}</td>
                <td><Cert value={s.certification} /></td>
                <td><span className={"load-pill " + cls}>{s.shiftCount}</span></td>
                <td>{s.hours}h</td>
                <td className="muted">{s.lastShift ? fmtDateTime(s.lastShift.start) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  ) : null;

  // ── Draft-schedule calendar: month/week grid with drag-and-drop ────────────
  const CAL_SLOTS = ["Day", "Evening", "Night"];
  const ROLE_ORDER = ["RN", "LPN", "CCA"];
  const slotOf = (s) => {
    const label = s.notes ? String(s.notes).split(" · ")[0] : "";
    if (CAL_SLOTS.includes(label)) return label;
    const h = new Date(s.startTime).getHours();
    return h < 13 ? "Day" : h < 21 ? "Evening" : "Night";
  };
  // Bucket the loaded shifts by day-of-month → slot.
  const calCells = {};
  if (Array.isArray(schedule)) {
    for (const s of schedule) {
      const day = new Date(s.startTime).getDate();
      const cell = (calCells[day] = calCells[day] || { Day: [], Evening: [], Night: [] });
      cell[slotOf(s)].push(s);
    }
  }
  for (const day in calCells)
    for (const sl of CAL_SLOTS)
      calCells[day][sl].sort((a, b) =>
        (ROLE_ORDER.indexOf(a.requiredCertification) - ROLE_ORDER.indexOf(b.requiredCertification)) ||
        ((a.staff?.lastName || "~").localeCompare(b.staff?.lastName || "~")));
  // Lay the month out as weeks (Sun→Sat), padding with nulls.
  const daysInThisMonth = new Date(period.year, period.month, 0).getDate();
  const leadBlanks = new Date(period.year, period.month - 1, 1).getDay();
  const calWeeks = [];
  let wk = new Array(leadBlanks).fill(null);
  for (let d = 1; d <= daysInThisMonth; d++) {
    wk.push(d);
    if (wk.length === 7) { calWeeks.push(wk); wk = []; }
  }
  if (wk.length) { while (wk.length < 7) wk.push(null); calWeeks.push(wk); }
  const safeWeek = Math.max(0, Math.min(calWeek, calWeeks.length - 1));

  const renderChip = (shift) => {
    const role = shift.requiredCertification || "NA";
    const open = !shift.staffId || shift.status === "OPEN";
    return (
      <div
        key={shift.id}
        className={`cal-chip chip-${role}${open ? " cal-chip-open" : ""}${dropId === shift.id ? " drop-hot" : ""}${dragId === shift.id ? " dragging" : ""}`}
        draggable={!open}
        onDragStart={(e) => onChipDragStart(e, shift)}
        onDragEnd={() => { setDragId(null); setDropId(null); }}
        onDragOver={(e) => { e.preventDefault(); if (dropId !== shift.id) setDropId(shift.id); }}
        onDragLeave={() => setDropId((id) => (id === shift.id ? null : id))}
        onDrop={(e) => onChipDrop(e, shift)}
        title={open
          ? `Open ${role} ${slotOf(shift)} shift — drop someone here to fill it`
          : `${shift.staff.firstName} ${shift.staff.lastName} · ${role} · ${slotOf(shift)} — drag to swap, or onto an Open slot`}
      >
        <span className="chip-role">{role}</span>
        <span className="chip-name">{open ? "Open" : `${shift.staff.firstName} ${(shift.staff.lastName || "").charAt(0)}`}</span>
      </div>
    );
  };
  const renderCalDay = (dayNum, big) => {
    if (!dayNum) return <div className="cal-day cal-day-empty" />;
    const cell = calCells[dayNum] || { Day: [], Evening: [], Night: [] };
    const dow = new Date(period.year, period.month - 1, dayNum).toLocaleDateString(undefined, { weekday: "short" });
    return (
      <div className={`cal-day${big ? " cal-day-big" : ""}`}>
        <div className="cal-day-head">
          <span className="cal-daynum">{dayNum}</span>
          {big && <span className="cal-dow muted">{dow}</span>}
          <button type="button" className="cal-add" title="Add a shift on this day" onClick={() => openAddShift(dateOf(dayNum))}>+</button>
        </div>
        {CAL_SLOTS.map((sl) => (
          <div className="cal-slot" key={sl}>
            <span className="cal-slot-label">{sl}</span>
            <div className="cal-slot-chips">
              {cell[sl].length ? cell[sl].map(renderChip) : <span className="cal-slot-empty">·</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const calendarCard = (
    <section className="card span2">
      <div className="card-head">
        <h2>
          Schedule calendar — {currentSite ? currentSite.name + " · " : ""}{monthName} {period.year}
          {schedulePeriod && (
            <span className={"sched-badge " + (schedulePeriod.status === "PUBLISHED" ? "posted" : "draft")}>
              {schedulePeriod.status === "PUBLISHED" ? "Posted" : "Draft — not visible to staff"}
            </span>
          )}
        </h2>
        <div className="sched-actions">
          <div className="cal-toggle">
            <button className={calView === "month" ? "on" : ""} onClick={() => setCalView("month")}>Month</button>
            <button className={calView === "week" ? "on" : ""} onClick={() => setCalView("week")}>Week</button>
          </div>
          <button className="btn" onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate"}</button>
          {schedulePeriod && schedulePeriod.status !== "PUBLISHED" && (
            <button className="btn-accept" onClick={postSchedule}>Post schedule</button>
          )}
        </div>
      </div>

      {addShiftFor && (
        <div className="add-shift-panel">
          <div className="add-shift-head">
            <strong>Add a shift — {(scheduleDates.find((d) => d.dateStr === addShiftFor) || { label: addShiftFor }).label}</strong>
            <button type="button" className="btn-ghost sm" onClick={closeAddShift}>Cancel</button>
          </div>
          <div className="add-shift-row">
            <span className="muted">Shift</span>
            <div className="att-tabs">
              {["Day", "Evening", "Night"].map((s) => <button key={s} type="button" className={addSlot === s ? "on" : ""} onClick={() => pickAddSlot(s)}>{s}</button>)}
            </div>
          </div>
          <div className="add-shift-row">
            <span className="muted">Role</span>
            <div className="att-tabs">
              {["All", "RN", "LPN", "CCA"].map((c) => <button key={c} type="button" className={addShiftCert === c ? "on" : ""} onClick={() => pickAddCert(c)}>{c}</button>)}
            </div>
          </div>
          <input
            type="text" className="add-shift-search" placeholder="Search staff by name…"
            value={addSearch} onChange={(e) => setAddSearch(e.target.value)}
          />
          {addCands === null ? (
            <p className="muted">Loading your staff…</p>
          ) : visibleCands.length === 0 ? (
            <p className="muted">No one matches{addSearch ? ` “${addSearch}”` : ""}{addShiftCert !== "All" ? ` in ${addShiftCert}` : ""}.</p>
          ) : (
            <div className="cand-panel">
              {visibleCands.map((c) => (
                <div key={c.id} className={"cand-row" + (c.eligible ? "" : " ineligible")}>
                  <span className="cand-name">{c.name}</span>
                  <Cert value={c.certification} />
                  <span className="muted">{c.weeklyHours}h this wk</span>
                  {!c.eligible
                    ? <span className="rest-flag" title="Assigning would break the 8-hour rest / double rule">needs 8h rest</span>
                    : c.wouldBeOvertime
                    ? <span className="ot-flag">overtime{c.shiftCost != null ? ` · $${c.shiftCost}` : ""}</span>
                    : <span className="ok-flag">no overtime{c.shiftCost != null ? ` · $${c.shiftCost}` : ""}</span>}
                  <button className="btn-accept" disabled={!c.eligible} onClick={() => createAdhocShift(c.id, c.certification)}>Assign</button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button" className="btn-ghost sm add-shift-open"
            disabled={addShiftCert === "All"}
            title={addShiftCert === "All" ? "Pick a role (RN/LPN/CCA) to post an open shift" : undefined}
            onClick={() => createAdhocShift(null, addShiftCert)}
          >
            {addShiftCert === "All" ? "Post as open shift (pick a role first)" : `Post as open ${addShiftCert} shift instead`}
          </button>
          {addMsg && <div className="note">{addMsg}</div>}
        </div>
      )}

      {(!Array.isArray(schedule) || schedule.length === 0) ? (
        <div className="empty" style={{ paddingBottom: 4 }}>
          <p>No shifts for {monthName} yet.</p>
          <p className="muted">Set your staffing needs above and click “Generate” — or use a day's “+” below to add a single shift.</p>
        </div>
      ) : (
        <div className="cal-legend">
          <span className="muted">Drag a name onto a coworker to <b>swap</b>, or onto an <b>Open</b> slot to <b>fill</b> it (their old slot then opens). Same role only; the 8-hour-rest rule still applies. Use a day's <b>+</b> to add a single shift.</span>
          <span className="cal-legend-roles">
            <span className="chip-role chip-RN">RN</span>
            <span className="chip-role chip-LPN">LPN</span>
            <span className="chip-role chip-CCA">CCA</span>
          </span>
        </div>
      )}

      {calView === "week" && (
        <div className="cal-week-nav">
          <button className="navbtn" disabled={safeWeek <= 0} onClick={() => setCalWeek(Math.max(0, safeWeek - 1))}>‹</button>
          <span className="muted">Week {safeWeek + 1} of {calWeeks.length}</span>
          <button className="navbtn" disabled={safeWeek >= calWeeks.length - 1} onClick={() => setCalWeek(Math.min(calWeeks.length - 1, safeWeek + 1))}>›</button>
        </div>
      )}

      <div className={"cal-dow-head" + (calView === "week" ? " wide" : "")}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="cal-dow-cell muted">{d}</div>)}
      </div>

      {calView === "month" ? (
        <div className="cal-month">
          {calWeeks.flat().map((d, i) => <React.Fragment key={i}>{renderCalDay(d, false)}</React.Fragment>)}
        </div>
      ) : (
        <div className="cal-week">
          {(calWeeks[safeWeek] || []).map((d, i) => <React.Fragment key={i}>{renderCalDay(d, true)}</React.Fragment>)}
        </div>
      )}
      {scheduleMsg && <div className="note">{scheduleMsg}</div>}
    </section>
  );

  return (<>
    <Toolbar ctx={ctx} />
    {staffingCard}
    {distributionCard}
    {calendarCard}
  </>);
}
