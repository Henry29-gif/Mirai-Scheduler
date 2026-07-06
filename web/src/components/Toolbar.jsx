import React from "react";

// Site + month toolbar — shown on Home and in the manager "Staffing needs and
// schedule" view (so the manager can pick what to schedule).
export function Toolbar({ ctx }) {
  const { isAdmin, siteId, setSiteId, sites, monthName, period, shiftMonth } = ctx;
  return (
    <section className="card span2 toolbar">
      <div className="toolbar-group">
        <label className="toolbar-label">{isAdmin ? "Site" : "Your site"}</label>
        <select className="select" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={sites.length <= 1}>
          {sites.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s._count.users} staff)</option>))}
        </select>
      </div>
      <div className="toolbar-group">
        <label className="toolbar-label">Month</label>
        <div className="month-nav">
          <button className="navbtn" onClick={() => shiftMonth(-1)} title="Previous month">‹</button>
          <span className="month-label">{monthName} {period.year}</span>
          <button className="navbtn" onClick={() => shiftMonth(1)} title="Next month">›</button>
        </div>
      </div>
    </section>
  );
}
