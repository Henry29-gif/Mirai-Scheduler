import React from "react";

// Notification bell + dropdown panel (with inline Accept/Decline quick actions).
export function NotifBell({ ctx }) {
  const { notifs, unread, showNotifs, openNotifs, notifActed, actOnNotif } = ctx;
  return (
    <div className="notif-wrap">
      <button className="theme-toggle" onClick={openNotifs} aria-label="Notifications" title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {showNotifs && (
        <div className="notif-panel">
          <div className="notif-head">Notifications</div>
          <div className="notif-list">
            {notifs.length === 0 ? <div className="notif-empty">You're all caught up.</div> : notifs.map((n) => (
              <div key={n.id} className={"notif-item" + (n.isRead ? "" : " unread")}>
                <div className="notif-title">{n.title}</div>
                <div className="notif-body">{n.body}</div>
                <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
                {(n.metadata?.kind === "TIMEOFF_REQUEST" || n.metadata?.kind === "SWAP_REQUEST") && (
                  notifActed[n.id]
                    ? <div className="notif-acted">{notifActed[n.id]}</div>
                    : <div className="notif-actions">
                        <button className="notif-accept" onClick={() => actOnNotif(n, true)}>Accept</button>
                        <button className="notif-decline" onClick={() => actOnNotif(n, false)}>Decline</button>
                      </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
