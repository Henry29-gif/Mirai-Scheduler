import React from "react";
import { TimeOffStatus } from "../ui";
import { fmtDay } from "../format";

// My Space → "Request time off" (staff): request form + own request history.
export function TimeoffView({ ctx }) {
  const { toForm, setToForm, submitTimeoff, toMsg, timeoff } = ctx;
  return (
    <section className="card">
      <h2>Request time off</h2>
      <div className="to-form">
        <div className="to-row">
          <label>From<input type="date" value={toForm.startDate} onChange={(e) => setToForm({ ...toForm, startDate: e.target.value })} /></label>
          <label>To<input type="date" value={toForm.endDate} onChange={(e) => setToForm({ ...toForm, endDate: e.target.value })} /></label>
        </div>
        <label>Type
          <select value={toForm.type} onChange={(e) => setToForm({ ...toForm, type: e.target.value })}>
            <option value="VACATION">Vacation</option><option value="SICK">Sick</option>
            <option value="PERSONAL">Personal</option><option value="UNPAID">Unpaid</option>
          </select>
        </label>
        <label>Reason (optional)<input type="text" value={toForm.reason} onChange={(e) => setToForm({ ...toForm, reason: e.target.value })} placeholder="e.g. Family trip" /></label>
        <button className="btn" onClick={submitTimeoff}>Submit request</button>
        {toMsg && <div className="note">{toMsg}</div>}
      </div>
      <div className="to-list">
        {timeoff.length === 0 ? <p className="muted">No requests yet.</p> : timeoff.map((t) => (
          <div key={t.id} className="to-item">
            <span>{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · <span className="muted">{t.type.toLowerCase()}</span></span>
            <TimeOffStatus value={t.status} />
          </div>
        ))}
      </div>
    </section>
  );
}
