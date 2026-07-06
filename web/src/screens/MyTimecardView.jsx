import React from "react";
import { fmtDay, fmtMins, clockTime } from "../format";

// My Space → "My timecard" (staff): own clock-in history & hours.
export function MyTimecardView({ ctx }) {
  const { timecard } = ctx;
  return (
    <section className="card span2">
      <h2>My timecard {timecard ? <span className="muted" style={{ fontWeight: 400, fontSize: "14px" }}>· {fmtMins(timecard.totalMinutes)} in last 14 days</span> : ""}</h2>
      {(!timecard || timecard.days.length === 0) ? (
        <p className="muted">No clock-ins yet. Use the Time clock on your dashboard.</p>
      ) : (
        timecard.days.map((d) => (
          <div key={d.date} className="tc-day">
            <div className="tc-date">{fmtDay(d.date)}<span className="muted"> · {fmtMins(d.minutes)}</span></div>
            <div className="tc-sessions">
              {d.sessions.map((s, i) => (
                <span key={i} className="muted">{clockTime(s.in)} – {s.out ? clockTime(s.out) : "in progress"}</span>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
