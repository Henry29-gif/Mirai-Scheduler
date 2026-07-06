import React from "react";
import { Cert } from "../ui";
import { fmtMins, clockTime } from "../format";

// My Space → "Live attendance" (managers): who's clocked in right now.
// Admins get tabs to flip between homes — or "All homes", which shows every
// facility's clocked-in staff on one page (the default).
export function AttendanceView({ ctx }) {
  const {
    attendance, loadAttendance, isAdmin, sites, siteId, setSiteId,
    attAll, setAttAll, attendanceAll, loadAttendanceAll,
  } = ctx;

  const showAll = isAdmin && attAll;
  const showTabs = isAdmin && sites.length > 1;
  const totalOn = attendanceAll.reduce((n, f) => n + f.onNow.length, 0);
  const totalStaff = attendanceAll.reduce((n, f) => n + f.totalStaff, 0);

  const personRow = (p) => (
    <div key={p.id} className="att-item">
      <div className="att-who">
        <span className="att-dot" />
        <span className="att-name">{p.firstName} {p.lastName}</span>
        <Cert value={p.certification} />
      </div>
      <div className="muted">On since {clockTime(p.since)} · {fmtMins(p.minutes)}</div>
    </div>
  );

  return (
    <section className="card span2">
      <div className="att-head">
        <h2 style={{ margin: 0 }}>
          Who's clocked in{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
            {showAll
              ? `· ${totalOn} of ${totalStaff} staff on now · all ${sites.length} homes`
              : `· ${attendance.onNow.length} of ${attendance.totalStaff} staff on now`}
          </span>
        </h2>
        <button className="btn-ghost" onClick={() => (showAll ? loadAttendanceAll() : loadAttendance())}>Refresh</button>
      </div>

      {showTabs && (
        <div className="att-tabs">
          <button className={showAll ? "on" : ""} onClick={() => setAttAll(true)}>All homes</button>
          {sites.map((s) => (
            <button key={s.id} className={!attAll && siteId === s.id ? "on" : ""} onClick={() => { setAttAll(false); setSiteId(s.id); }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {showAll ? (
        attendanceAll.length === 0 ? (
          <p className="muted">Loading homes…</p>
        ) : (
          attendanceAll.map((f) => (
            <div key={f.facilityId} className="att-site">
              <h3 className="att-site-name">
                {f.name} <span className="muted" style={{ fontWeight: 400 }}>· {f.onNow.length} of {f.totalStaff} on now</span>
              </h3>
              {f.onNow.length === 0 ? (
                <p className="muted att-site-empty">No one is clocked in right now.</p>
              ) : (
                <div className="att-list">{f.onNow.map(personRow)}</div>
              )}
            </div>
          ))
        )
      ) : attendance.onNow.length === 0 ? (
        <p className="muted">No one is clocked in right now.</p>
      ) : (
        <div className="att-list">{attendance.onNow.map(personRow)}</div>
      )}
    </section>
  );
}
