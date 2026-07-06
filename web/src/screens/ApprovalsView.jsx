import React from "react";
import { Cert } from "../ui";
import { fmtDay } from "../format";

// My Space → "Time-off approvals" (managers): pending leave requests.
export function ApprovalsView({ ctx }) {
  const { timeoff, respondTimeoff, toMsg } = ctx;
  return (
    <section className="card">
      <h2>Time-off approvals {timeoff.filter((t) => t.status === "PENDING").length ? `(${timeoff.filter((t) => t.status === "PENDING").length})` : ""}</h2>
      {timeoff.filter((t) => t.status === "PENDING").length === 0 ? (
        <p className="muted">No pending requests.</p>
      ) : timeoff.filter((t) => t.status === "PENDING").map((t) => (
        <div key={t.id} className="to-approval">
          <div>
            <div className="to-name">{t.user.firstName} {t.user.lastName} <Cert value={t.user.certification} /></div>
            <div className="muted">{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · {t.type.toLowerCase()}{t.reason ? ` · "${t.reason}"` : ""}</div>
          </div>
          <div className="to-actions">
            <button className="btn-accept" onClick={() => respondTimeoff(t.id, true)}>Approve</button>
            <button className="btn-ghost" onClick={() => respondTimeoff(t.id, false)}>Deny</button>
          </div>
        </div>
      ))}
      {toMsg && <div className="note">{toMsg}</div>}
    </section>
  );
}
