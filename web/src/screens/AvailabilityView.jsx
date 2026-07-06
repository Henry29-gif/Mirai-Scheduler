import React from "react";

// My Space → "My availability" (staff): weekly grid of shifts I can work.
export function AvailabilityView({ ctx }) {
  const { isBlocked, toggleAvail } = ctx;
  return (
    <section className="card">
      <h2>My availability</h2>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14, fontSize: 13 }}>Tap a slot to mark yourself off — the scheduler won't assign you there.</p>
      <table className="tbl avail-grid">
        <thead><tr><th></th><th>Day</th><th>Evening</th><th>Night</th></tr></thead>
        <tbody>
          {[["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]].map(([label, dow]) => (
            <tr key={dow}>
              <td className="avail-day">{label}</td>
              {["Day", "Evening", "Night"].map((s) => {
                const off = isBlocked(dow, s);
                return <td key={s}><button className={"avail-cell " + (off ? "off" : "on")} onClick={() => toggleAvail(dow, s)}>{off ? "Off" : "Available"}</button></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
