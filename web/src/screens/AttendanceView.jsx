import React from "react";
import { Cert } from "../ui";
import { fmtMins, clockTime } from "../format";

// My Space → "Live attendance" (managers): who's clocked in right now.
export function AttendanceView({ ctx }) {
  const { attendance, loadAttendance } = ctx;
  return (
    <section className="card span2">
      <div className="att-head">
        <h2 style={{ margin: 0 }}>Who's clocked in <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {attendance.onNow.length} of {attendance.totalStaff} staff on now</span></h2>
        <button className="btn-ghost" onClick={loadAttendance}>Refresh</button>
      </div>
      {attendance.onNow.length === 0 ? (
        <p className="muted">No one is clocked in right now.</p>
      ) : (
        <div className="att-list">
          {attendance.onNow.map((p) => (
            <div key={p.id} className="att-item">
              <div className="att-who">
                <span className="att-dot" />
                <span className="att-name">{p.firstName} {p.lastName}</span>
                <Cert value={p.certification} />
              </div>
              <div className="muted">On since {clockTime(p.since)} · {fmtMins(p.minutes)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
