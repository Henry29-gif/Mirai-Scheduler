import React from "react";

// The My Space menu: role-based links to every sub-view + the delete-account
// danger zone.
export function MySpaceView({ ctx }) {
  const { isManager, isAdmin, setView, deleteAccount } = ctx;
  return (
    <section className="card span2">
      <h2>My Space</h2>
      <div className="myspace-links">
        {(isManager
          ? [{ label: "Staffing needs and schedule", sub: "Set needs, generate, balance & post the schedule", v: "scheduling" }, ...(isAdmin ? [{ label: "My Staff", sub: "Profiles, files, pay & reliability", v: "mystaff" }] : []), { label: "Live attendance", sub: "See who's clocked in right now", v: "attendance" }, { label: "Timecards", sub: "Review & approve staff hours", v: "factimecards" }, { label: "Time-off approvals", sub: "Review staff leave requests", v: "approvals" }]
          : [{ label: "Request time off", sub: "Submit and track leave requests", v: "timeoff" }, { label: "My availability", sub: "Set the shifts you can work", v: "availability" }, { label: "My timecard", sub: "Your clock-in history & hours", v: "timecard" }, { label: "Certification", sub: "Your licenses & expiry dates", v: "certs" }]
        ).map((it) => (
          <button key={it.v} className="myspace-link" onClick={() => setView(it.v)}>
            <span className="myspace-link-title">{it.label}</span>
            <span className="myspace-link-sub">{it.sub}</span>
            <span className="myspace-link-arrow">›</span>
          </button>
        ))}
      </div>
      <div className="danger-zone">
        <div>
          <div className="danger-title">Delete account</div>
          <div className="myspace-link-sub">Erases your personal details and disables sign-in. This can't be undone.</div>
        </div>
        <button className="btn-danger" onClick={deleteAccount}>Delete account</button>
      </div>
    </section>
  );
}
