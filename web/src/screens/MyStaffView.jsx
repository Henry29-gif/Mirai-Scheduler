import React from "react";
import { Cert } from "../ui";
import { fmtDay } from "../format";
import { Toolbar } from "../components/Toolbar";

// My Space → "My Staff" (admin): roster metrics, per-person HR documents
// (upload / download / merged download / delete) and read-only certifications.
export function MyStaffView({ ctx }) {
  const {
    currentSite, monthName, roster, expandStaff, staffExpanded, relClass,
    staffCerts, certStatus, staffDocs, uploadStaffDocs, downloadStaffFile,
    deleteStaffDoc, staffMsg,
  } = ctx;

  return (<>
    <Toolbar ctx={ctx} />
    <section className="card span2">
      <div className="card-head">
        <h2>My Staff <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {currentSite ? currentSite.name : "this site"}</span></h2>
        <span className="muted" style={{ fontSize: 13 }}>Tap a person for details &amp; files</span>
      </div>
      {roster.length === 0 ? <p className="muted">No staff at this site.</p> : (
        <table className="tbl staff-tbl">
          <thead><tr><th>Name</th><th>Cert</th><th>Shifts</th><th>Attendance</th><th>Punctuality</th><th>Pay ({monthName})</th><th>Reliability</th><th>Files</th></tr></thead>
          <tbody>
            {roster.map((s) => (
              <React.Fragment key={s.userId}>
                <tr className="staff-row" onClick={() => expandStaff(s.userId)}>
                  <td><strong>{s.firstName} {s.lastName}</strong></td>
                  <td><Cert value={s.certification} /></td>
                  <td>{s.shiftsWorked}<span className="muted">/{s.shiftsScheduledPast}</span></td>
                  <td>{s.attendancePct == null ? "—" : s.attendancePct + "%"}</td>
                  <td>{s.punctualityPct == null ? "—" : s.punctualityPct + "%"}</td>
                  <td>${s.pay.toLocaleString()}</td>
                  <td><span className={"rel-pill " + relClass(s.reliabilityLabel)}>{s.reliabilityLabel}{s.reliabilityScore != null ? ` · ${s.reliabilityScore}` : ""}</span></td>
                  <td>{s.documentCount}</td>
                </tr>
                {staffExpanded === s.userId && (
                  <tr className="staff-detail">
                    <td colSpan={8}>
                      <div className="staff-detail-grid">
                        <div className="sd-box"><div className="sd-num">{s.shiftsWorked}<span className="muted">/{s.shiftsScheduledPast}</span></div><div className="sd-label">Shifts worked / scheduled</div></div>
                        <div className="sd-box"><div className="sd-num">{s.attendancePct == null ? "—" : s.attendancePct + "%"}</div><div className="sd-label">Attendance</div></div>
                        <div className="sd-box"><div className="sd-num">{s.punctualityPct == null ? "—" : s.punctualityPct + "%"}</div><div className="sd-label">On-time · {s.lateCount} late</div></div>
                        <div className="sd-box"><div className="sd-num">{s.callIns}</div><div className="sd-label">Call-ins (sick)</div></div>
                        <div className="sd-box"><div className="sd-num">${s.pay.toLocaleString()}</div><div className="sd-label">{monthName} pay · {s.payHours}h</div></div>
                        <div className="sd-box"><div className="sd-num">{s.reliabilityScore == null ? "—" : s.reliabilityScore}</div><div className="sd-label">Reliability · {s.reliabilityLabel}</div></div>
                      </div>

                      <div className="doc-head"><h3>Certifications ({staffCerts.length})</h3></div>
                      {staffCerts.length === 0 ? (
                        <p className="muted">None recorded by this staff member.</p>
                      ) : (
                        <div className="doc-list">
                          {staffCerts.map((c) => {
                            const st = certStatus(c.expiryDate);
                            return (
                              <div key={c.id} className="doc-item">
                                <span className="doc-name">{c.name}{c.number ? ` · ${c.number}` : ""}</span>
                                <span className="muted">{c.expiryDate ? `exp ${fmtDay(c.expiryDate)}` : "no expiry"}</span>
                                <span className={"rel-pill " + st.cls}>{st.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="doc-head">
                        <h3>Documents ({staffDocs.length})</h3>
                        <div className="doc-actions">
                          <label className="btn-accept sm doc-upload">Upload PDFs
                            <input type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={(e) => { uploadStaffDocs(s.userId, e.target.files); e.target.value = ""; }} />
                          </label>
                          {staffDocs.length > 0 && (
                            <button className="btn sm" onClick={() => downloadStaffFile(`/api/staff/${s.userId}/documents/merged`, `${s.firstName}_${s.lastName}_documents.pdf`)}>Download all (merged)</button>
                          )}
                        </div>
                      </div>
                      {staffDocs.length === 0 ? (
                        <p className="muted">No files yet. Upload PDFs — contracts, certifications, reviews…</p>
                      ) : (
                        <div className="doc-list">
                          {staffDocs.map((d) => (
                            <div key={d.id} className="doc-item">
                              <span className="doc-name">{d.filename}</span>
                              <span className={"rel-pill " + (d.source === "STAFF" ? "rel-ok" : "rel-none")} title={d.source === "STAFF" ? "Uploaded by the staff member" : "Uploaded by an admin"}>{d.source === "STAFF" ? "Staff" : "Admin"}</span>
                              <span className="muted">{Math.max(1, Math.round(d.size / 1024))} KB · {fmtDay(d.createdAt)}</span>
                              <button className="link-trade" onClick={() => downloadStaffFile(`/api/staff/${s.userId}/documents/${d.id}/download`, d.filename)}>Download</button>
                              <button className="link-drop" onClick={() => deleteStaffDoc(s.userId, d.id)}>Delete</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {staffMsg && <div className="note">{staffMsg}</div>}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  </>);
}
