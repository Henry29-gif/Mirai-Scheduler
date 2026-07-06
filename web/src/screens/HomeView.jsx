import React from "react";
import { Cert, RoleBadge, ReasonBadge } from "../ui";
import { money, fmtMins, clockTime, fmtDateTime, fmtTime } from "../format";
import { Toolbar } from "../components/Toolbar";

// Home: cost dashboard (managers), welcome + team, time clock (staff), the
// staff schedule, trade panels, the open-shift board and the audit trail.
export function HomeView({ ctx }) {
  const {
    user, isManager, isAdmin, sites, currentSite, team, monthName, period,
    cost, downloadTimesheet, clock, toggleClock, schedule, schedulePeriod,
    postSchedule, scheduleMsg, reassignMsg, openReassign, reassignFor, reassignCands,
    doReassign, openTrade, tradeFor, releaseShift, tradeOpts, proposeTrade, tradeMsg,
    swaps, respondSwap, openShifts, viewCandidates, expanded, candidates,
    acceptShift, fillShift, openMsg, audit,
  } = ctx;

  // The schedule itself — on Home for staff (their shifts); managers manage the
  // full schedule in My Space → "Staffing needs and schedule".
  const scheduleCard = (
    <section className="card span2">
      <div className="card-head">
        <h2>
          Schedule — {currentSite ? currentSite.name + " · " : ""}{monthName} {period.year}
          {isManager && schedulePeriod && (
            <span className={"sched-badge " + (schedulePeriod.status === "PUBLISHED" ? "posted" : "draft")}>
              {schedulePeriod.status === "PUBLISHED" ? "Posted" : "Draft — not visible to staff"}
            </span>
          )}
        </h2>
        {isManager && schedulePeriod && schedulePeriod.status !== "PUBLISHED" && (
          <div className="sched-actions">
            <button className="btn-accept" onClick={postSchedule}>Post schedule</button>
          </div>
        )}
      </div>

      {Array.isArray(schedule) && schedule.length > 0 ? (
        <table className="tbl">
          <thead><tr><th>Staff</th><th>Cert</th><th>Unit</th><th>Start</th><th>End</th><th></th></tr></thead>
          <tbody>
            {schedule.slice(0, 60).map((s) => {
              const mine = s.staff?.id === user.id;
              const canRelease = mine || isManager;
              return (
                <React.Fragment key={s.id}>
                <tr>
                  <td>{s.staff?.firstName} {s.staff?.lastName}{mine ? " (you)" : ""}</td>
                  <td><Cert value={s.requiredCertification} /></td>
                  <td>{s.unit?.name}</td>
                  <td>{new Date(s.startTime).toLocaleString()}</td>
                  <td>{new Date(s.endTime).toLocaleString()}</td>
                  <td className="row-actions">
                    {isManager && (
                      <button className="link-reassign" title="Swap this shift to another staff member" onClick={() => openReassign(s.id)}>{reassignFor === s.id ? "Close" : "Reassign"}</button>
                    )}
                    {mine && (
                      <button className="link-trade" title="Trade this shift with a coworker" onClick={() => openTrade(s.id)}>{tradeFor === s.id ? "Close" : "Trade"}</button>
                    )}
                    {canRelease && (
                      <>
                        {isManager && <button className="link-sick" title="Call in sick" onClick={() => releaseShift(s.id, "SICK")}>Sick</button>}
                        <button className="link-drop" title="Drop this shift to the open board" onClick={() => releaseShift(s.id, "SWAP")}>Drop</button>
                      </>
                    )}
                  </td>
                </tr>
                {reassignFor === s.id && (
                  <tr className="reassign-row">
                    <td colSpan={6}>
                      {reassignCands === null ? (
                        <span className="muted">Loading eligible coworkers…</span>
                      ) : reassignCands.length === 0 ? (
                        <span className="muted">No eligible coworker (needs a {s.requiredCertification} who is rest-safe).</span>
                      ) : (
                        <div className="reassign-list">
                          <span className="muted">Move this {s.requiredCertification} shift to:</span>
                          {reassignCands.map((c) => (
                            <button key={c.id} className="btn-accept sm" onClick={() => doReassign(s.id, c.id)}>
                              {c.name} · {c.weeklyHours}h{c.wouldBeOvertime ? " · OT" : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <p>No shifts scheduled for {monthName} yet.</p>
          {isManager
            ? <p className="muted">Click “Generate schedule” to auto-assign shifts.</p>
            : <p className="muted">Your manager hasn’t published a schedule yet.</p>}
        </div>
      )}
      {scheduleMsg && <div className="note">{scheduleMsg}</div>}
      {reassignMsg && <div className="note">{reassignMsg}</div>}
    </section>
  );

  return (<>
    {/* Site + month toolbar */}
    <Toolbar ctx={ctx} />

    {/* ── Overtime cost dashboard (managers/admins) ───────────────── */}
    {isManager && cost && (
      <section className="card span2 cost-card">
        <div className="card-head">
          <h2>Labor cost — {monthName} {period.year}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {cost.overtimeCost > 0
              ? <span className="cost-alert">{money(cost.overtimeCost)} in overtime</span>
              : <span className="cost-ok">No overtime</span>}
            {isAdmin && <button className="btn" style={{ width: "auto", marginTop: 0, height: 40, padding: "0 16px" }} onClick={downloadTimesheet}>Export payroll</button>}
          </div>
        </div>
        <div className="cost-grid">
          <div className="cost-box"><div className="cost-num">{money(cost.totalCost)}</div><div className="cost-label">Projected total</div></div>
          <div className="cost-box"><div className={"cost-num " + (cost.overtimeCost > 0 ? "warn" : "good")}>{money(cost.overtimeCost)}</div><div className="cost-label">Overtime cost</div></div>
          <div className="cost-box"><div className="cost-num">{cost.overtimeHours}h</div><div className="cost-label">Overtime hours</div></div>
          <div className="cost-box"><div className="cost-num">{cost.staffOnOvertime}</div><div className="cost-label">Staff in overtime</div></div>
          <div className="cost-box"><div className="cost-num">{cost.openShifts}</div><div className="cost-label">Unfilled (lost coverage)</div></div>
        </div>
        <div className="cost-bycert">
          {Object.entries(cost.byCert || {}).map(([c, v]) => (
            <span key={c} className="chip"><Cert value={c} /> {money(v.cost)} · {v.hours}h</span>
          ))}
        </div>
      </section>
    )}

    <section className="card">
      <h2>Welcome, {user.firstName}</h2>
      <p className="muted">
        You're signed in as <strong>{user.role}</strong>
        {isAdmin ? <> · managing <strong>{sites.length}</strong> site{sites.length === 1 ? "" : "s"}</> : null}.
      </p>
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{team.length}</div><div className="stat-label">Staff{currentSite ? ` · ${currentSite.name.split(" ")[0]}` : ""}</div></div>
        <div className="stat"><div className="stat-num">{Array.isArray(schedule) ? schedule.length : 0}</div><div className="stat-label">Shifts ({monthName})</div></div>
      </div>
    </section>

    {!isManager && (
      <section className="card clock-card">
        <h2>Time clock</h2>
        <div className="clock-row">
          <div>
            <div className={"clock-state " + (clock.clockedIn ? "on" : "off")}>{clock.clockedIn ? "Clocked in" : "Clocked out"}</div>
            <div className="muted">{clock.clockedIn ? `Since ${clockTime(clock.since)} · ` : ""}Today: {fmtMins(clock.todayMinutes)}</div>
          </div>
          <button className={"btn clock-btn " + (clock.clockedIn ? "out" : "in")} onClick={toggleClock}>{clock.clockedIn ? "Clock out" : "Clock in"}</button>
        </div>
      </section>
    )}

    <section className="card">
      <h2>Team</h2>
      <table className="tbl team-tbl">
        <thead><tr><th>Name</th><th>Positions</th>{isAdmin && <th>Rate</th>}<th>Role</th></tr></thead>
        <tbody>
          {team.map((u) => (
            <tr key={u.id}>
              <td>{u.firstName} {u.lastName}</td>
              <td><Cert value={u.certification} /></td>
              {isAdmin && <td className="muted">{u.hourlyRate ? `$${u.hourlyRate}/h` : "—"}</td>}
              <td><RoleBadge value={u.role} sm /></td>
            </tr>
          ))}
          {team.length === 0 && <tr><td colSpan={isAdmin ? 4 : 3} className="muted">No staff yet</td></tr>}
        </tbody>
      </table>
    </section>

    {/* Staff see their own schedule on Home. Managers manage staffing + the
        full schedule in My Space → "Staffing needs and schedule". */}
    {!isManager && scheduleCard}

    {/* ── Shift trade: propose panel ──────────────────────────────── */}
    {tradeFor && (
      <section className="card span2">
        <h2>Trade a shift</h2>
        {!tradeOpts ? (
          <p className="muted">Loading coworkers…</p>
        ) : (
          <>
            <div className="trade-mine">
              <span className="muted">You give up:</span>{" "}
              <Cert value={tradeOpts.myShift.requiredCertification} />{" "}
              <strong>{fmtDateTime(tradeOpts.myShift.startTime)} – {fmtTime(tradeOpts.myShift.endTime)}</strong>{" "}
              <span className="muted">· {tradeOpts.myShift.unit}</span>
            </div>
            {tradeOpts.coworkers.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>No coworkers have a rest-compatible shift to trade for this one.</p>
            ) : (
              tradeOpts.coworkers.map((c) => (
                <div key={c.id} className="trade-coworker">
                  <div className="trade-coworker-name">{c.name} <Cert value={c.certification} /></div>
                  {c.shifts.map((s) => (
                    <div key={s.id} className="trade-offer">
                      <span className="muted">You'd work instead:</span>{" "}
                      <strong>{fmtDateTime(s.startTime)} – {fmtTime(s.endTime)}</strong>{" "}
                      <span className="muted">· {s.unit?.name}</span>
                      <button className="btn-accept" style={{ marginLeft: "auto" }} onClick={() => proposeTrade(s.id)}>Request trade</button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </>
        )}
        {tradeMsg && <div className="note">{tradeMsg}</div>}
      </section>
    )}

    {/* ── Incoming trade requests ─────────────────────────────────── */}
    {swaps.incoming.length > 0 && (
      <section className="card span2">
        <h2>Incoming trade requests ({swaps.incoming.length})</h2>
        {swaps.incoming.map((sw) => (
          <div key={sw.id} className="trade-incoming">
            <div className="trade-incoming-info">
              <div className="trade-from">{sw.requestor.firstName} {sw.requestor.lastName} wants to trade</div>
              <div className="trade-legs">
                <span className="leg leg-get">You'd work: <strong>{fmtDateTime(sw.originalShift.startTime)} – {fmtTime(sw.originalShift.endTime)}</strong> · {sw.originalShift.unit?.name}</span>
                <span className="leg leg-give">They'd take: <strong>{fmtDateTime(sw.offeredShift.startTime)} – {fmtTime(sw.offeredShift.endTime)}</strong> · {sw.offeredShift.unit?.name}</span>
              </div>
            </div>
            <div className="trade-actions">
              <button className="btn-accept" onClick={() => respondSwap(sw.id, true)}>Accept</button>
              <button className="btn-ghost" onClick={() => respondSwap(sw.id, false)}>Decline</button>
            </div>
          </div>
        ))}
        {tradeMsg && <div className="note">{tradeMsg}</div>}
      </section>
    )}

    {/* ── Open Shifts board ───────────────────────────────────────── */}
    <section className="card span2">
      <div className="card-head">
        <h2>Open shifts {openShifts.length ? `(${openShifts.length})` : ""}</h2>
        <div className="cert-chips">
          {["RN", "LPN", "CCA"].map((c) => {
            const n = openShifts.filter((s) => s.requiredCertification === c).length;
            return n ? <span key={c} className="chip"><Cert value={c} /> {n}</span> : null;
          })}
        </div>
      </div>

      {openShifts.length === 0 ? (
        <div className="empty"><p>Full coverage — no open shifts for {monthName}.</p></div>
      ) : (
        <div className="open-list">
          {openShifts.slice(0, 25).map((s) => (
            <div key={s.id} className="open-row">
              <div className="open-main">
                <div className="open-info">
                  <Cert value={s.requiredCertification} />
                  <ReasonBadge value={s.openReason} />
                  <span className="open-when">
                    {new Date(s.startTime).toLocaleDateString()} ·{" "}
                    {new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="muted">{s.unit?.name}</span>
                </div>
                {isManager ? (
                  <button className="btn-ghost" onClick={() => viewCandidates(s.id)}>
                    {expanded === s.id ? "Hide" : "Find staff ▾"}
                  </button>
                ) : (
                  <button className="btn-accept" onClick={() => acceptShift(s.id)}>Accept</button>
                )}
              </div>

              {expanded === s.id && (
                <div className="cand-panel">
                  {candidates.length === 0 ? (
                    <span className="muted">No eligible {s.requiredCertification} available (rest / weekly-cap limits).</span>
                  ) : (
                    candidates.map((c, i) => (
                      <div key={c.id} className="cand-row">
                        <span className="cand-rank">{i === 0 ? "★" : i + 1}</span>
                        <span className="cand-name">{c.name}</span>
                        <span className="muted">{c.weeklyHours}h this wk</span>
                        {c.wouldBeOvertime
                          ? <span className="ot-flag">overtime{c.shiftCost != null ? ` · $${c.shiftCost}` : ""}</span>
                          : <span className="ok-flag">no overtime{c.shiftCost != null ? ` · $${c.shiftCost}` : ""}</span>}
                        <button className="btn-accept" onClick={() => fillShift(s.id, c.id)}>Assign</button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
          {openShifts.length > 25 && (
            <div className="muted open-more">+ {openShifts.length - 25} more open shifts…</div>
          )}
        </div>
      )}
      {openMsg && <div className="note">{openMsg}</div>}
    </section>

    {/* ── Audit trail / compliance log ────────────────────────────── */}
    {isManager && (
      <section className="card span2">
        <h2>Audit trail <span className="muted" style={{ fontWeight: 400, fontSize: "13px" }}>· compliance log</span></h2>
        {audit.length === 0 ? (
          <div className="empty"><p className="muted">No recorded activity yet. Actions like generating, assigning, accepting, and sick call-ins are logged here.</p></div>
        ) : (
          <div className="audit-list">
            {audit.map((a) => (
              <div key={a.id} className="audit-row">
                <span className="audit-tag">{a.action.replace(/_/g, " ")}</span>
                <span className="audit-summary">{a.summary}</span>
                <span className="audit-meta">{a.actorName} · {new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    )}
  </>);
}