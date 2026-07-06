import React from "react";
import { Cert } from "../ui";
import { fmtDay, fmtMins, clockTime } from "../format";

// My Space → "Timecards" (managers): facility timecards with per-day approval
// and missed-punch correction.
export function TimecardsView({ ctx }) {
  const { facTimecards, tcMsg, setTcMsg, approveDay, reopenDay, fixFor, setFixFor, fixTime, setFixTime, correctPunch } = ctx;
  return (
    <section className="card span2">
      <h2>Timecards <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· last {facTimecards.rangeDays} days</span></h2>
      {tcMsg && <div className="note">{tcMsg}</div>}
      {facTimecards.staff.length === 0 ? (
        <p className="muted">No clock-ins in this period.</p>
      ) : (
        facTimecards.staff.map((s) => (
          <div key={s.id} className="ftc-staff">
            <div className="ftc-staff-head">
              <span className="att-name">{s.firstName} {s.lastName}</span> <Cert value={s.certification} />
              <span className="muted"> · {fmtMins(s.totalMinutes)} · {s.pendingDays ? `${s.pendingDays} to approve` : "all approved"}</span>
            </div>
            {s.days.map((d) => {
              const key = `${s.id}|${d.date}`;
              return (
                <div key={d.date} className="ftc-day">
                  <div className="ftc-day-info">
                    <span className="tc-date">{fmtDay(d.date)}</span>
                    <span className="muted"> · {fmtMins(d.minutes)}</span>
                    {d.missedPunch && <span className="badge sm pill-warn">Missed punch</span>}
                    <span className="ftc-sessions">{d.sessions.map((ss, i) => (
                      <span key={i} className="muted">{clockTime(ss.in)}–{ss.out ? clockTime(ss.out) : "…"}</span>
                    ))}</span>
                  </div>
                  <div className="ftc-day-actions">
                    {d.approval ? (
                      <><span className="badge sm pill-ok">Approved</span><button className="btn-ghost sm" onClick={() => reopenDay(s.id, d.date)}>Reopen</button></>
                    ) : (
                      <button className="btn-accept sm" onClick={() => approveDay(s.id, d.date)}>Approve</button>
                    )}
                    {d.missedPunch && <button className="btn-ghost sm" onClick={() => { setFixFor(fixFor === key ? null : key); setFixTime(""); setTcMsg(""); }}>Fix</button>}
                  </div>
                  {fixFor === key && (
                    <div className="ftc-fix">
                      <span className="muted">Add the missing clock-out:</span>
                      <input type="datetime-local" value={fixTime} onChange={(e) => setFixTime(e.target.value)} />
                      <button className="btn sm" onClick={() => correctPunch(s.id)}>Save</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
