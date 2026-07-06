import React from "react";
import { fmtDay } from "../format";

// My Space → "Certification" (staff): licenses/certs with expiry pills, plus
// my own certification documents (private to me + my managers).
export function CertsView({ ctx }) {
  const {
    certForm, setCertForm, addCert, certMsg, certs, certStatus, deleteCert,
    myDocs, uploadMyDocs, myDocMsg, downloadStaffFile, deleteMyDoc,
  } = ctx;
  return (
    <section className="card span2">
      <h2>Certification <span className="muted" style={{ fontWeight: 400, fontSize: "14px" }}>· your licenses &amp; expiry dates</span></h2>
      <div className="cert-form">
        <input type="text" placeholder="Name (e.g. RN License, CPR)" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} />
        <input type="text" placeholder="Number (optional)" value={certForm.number} onChange={(e) => setCertForm({ ...certForm, number: e.target.value })} />
        <label className="cert-exp">Expiry <input type="date" value={certForm.expiryDate} onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })} /></label>
        <button className="btn-accept" onClick={addCert}>Add</button>
      </div>
      {certMsg && <div className="note">{certMsg}</div>}
      {certs.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No certifications yet — add your licenses and credentials above.</p>
      ) : certs.map((c) => {
        const st = certStatus(c.expiryDate);
        return (
          <div key={c.id} className="cert-item">
            <div>
              <div className="cert-name">{c.name}{c.number ? <span className="muted"> · {c.number}</span> : ""}</div>
              <div className="muted" style={{ fontSize: 13 }}>{c.expiryDate ? `Expires ${fmtDay(c.expiryDate)}` : "No expiry date"}</div>
            </div>
            <div className="cert-actions">
              <span className={"rel-pill " + st.cls}>{st.label}</span>
              <button className="btn-ghost sm" onClick={() => deleteCert(c.id)}>Remove</button>
            </div>
          </div>
        );
      })}

      {/* My own certification documents — private to me + my managers */}
      <div className="doc-head" style={{ marginTop: 18 }}>
        <h3>Documents ({myDocs.length})</h3>
        <div className="doc-actions">
          <label className="btn-accept sm doc-upload">Upload PDFs
            <input type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={(e) => { uploadMyDocs(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -2 }}>PDF copies of your licenses or certificates. Only you and your managers can see these.</p>
      {myDocMsg && <div className="note">{myDocMsg}</div>}
      {myDocs.length === 0 ? (
        <p className="muted">No documents yet — upload PDF copies of your certifications above.</p>
      ) : (
        <div className="doc-list">
          {myDocs.map((d) => (
            <div key={d.id} className="doc-item">
              <span className="doc-name">{d.filename}</span>
              <span className="muted">{Math.max(1, Math.round(d.size / 1024))} KB · {fmtDay(d.createdAt)}</span>
              <button className="link-trade" onClick={() => downloadStaffFile(`/api/my/documents/${d.id}/download`, d.filename)}>Download</button>
              <button className="link-drop" onClick={() => deleteMyDoc(d.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
