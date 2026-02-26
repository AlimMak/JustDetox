import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./popup.css";
import { useActiveTab } from "./hooks/useActiveTab";
import { useSiteStatus } from "./hooks/useSiteStatus";
import { useLockedInSession } from "./hooks/useLockedInSession";
import { formatTime } from "./utils/formatTime";

function openAt(hash: string) {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("src/ui/options/options.html") + hash,
  });
}

const MODE_BADGE: Record<string, { label: string; cls: string }> = {
  blocked:        { label: "Blocked",      cls: "popup-mode-badge--blocked" },
  "time-limited": { label: "Time-limited", cls: "popup-mode-badge--limited" },
  unrestricted:   { label: "Unrestricted", cls: "popup-mode-badge--free" },
};

/** Live countdown of seconds remaining in a Locked In session. */
function useSessionCountdown(endTs: number | null): number {
  const [remaining, setRemaining] = useState<number>(() =>
    endTs ? Math.max(0, Math.floor((endTs - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!endTs) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((endTs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [endTs]);

  return remaining;
}

function Popup() {
  const { hostname, loading: tabLoading, error: tabError } = useActiveTab();
  const status = useSiteStatus(tabLoading ? null : hostname);
  const { session, loading: sessionLoading } = useLockedInSession();
  const loading = tabLoading || status.loading || sessionLoading;

  const sessionRemaining = useSessionCountdown(session?.endTs ?? null);

  const badge = MODE_BADGE[status.mode] ?? MODE_BADGE.unrestricted;

  const usedStr =
    status.activeSeconds > 0 ? formatTime(status.activeSeconds) : "—";

  const remStr =
    status.remainingSeconds !== null && status.remainingSeconds > 0
      ? formatTime(status.remainingSeconds)
      : status.mode === "time-limited"
        ? "None"
        : "—";

  return (
    <div className="popup-root">
      <header className="popup-header">
        <span className="popup-wordmark">JustDetox</span>
        {session && (
          <span className="popup-locked-in-pill">Locked In</span>
        )}
      </header>

      {/* Locked In session banner */}
      {!loading && session && (
        <div className="popup-session-banner">
          <div className="popup-session-info">
            <span className="popup-session-time">{formatTime(sessionRemaining)}</span>
            <span className="popup-session-sub">
              {session.allowedDomains.length} site{session.allowedDomains.length !== 1 ? "s" : ""} allowed
            </span>
          </div>
          <button
            className="btn btn-ghost btn--sm"
            onClick={() => openAt("#locked-in")}
            style={{ fontSize: "var(--text-xs)" }}
          >
            Settings
          </button>
        </div>
      )}

      {loading && <div className="popup-loading">Loading…</div>}

      {!loading && (tabError || status.error) && (
        <div className="popup-empty">Could not load status</div>
      )}

      {!loading && !tabError && !status.error && hostname === null && (
        <div className="popup-empty">No active site</div>
      )}

      {!loading && !tabError && !status.error && hostname !== null && (
        <main className="popup-body">
          <div className="popup-domain-row">
            <span className="popup-domain" title={hostname}>
              {hostname}
            </span>
            <span className={`popup-mode-badge ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          <div className="popup-stat-grid">
            <div className="popup-stat-cell">
              <div className="popup-stat-label">Used</div>
              <div className="popup-stat-value">{usedStr}</div>
            </div>
            <div className="popup-stat-cell">
              <div className="popup-stat-label">Remaining</div>
              <div
                className={`popup-stat-value ${
                  status.mode !== "time-limited" ? "popup-stat-value--muted" : ""
                }`}
              >
                {status.mode === "time-limited" ? remStr : "—"}
              </div>
            </div>
          </div>

          {status.mode === "blocked" && (
            <p className="popup-blocked-notice">This site is blocked.</p>
          )}
        </main>
      )}

      <footer className="popup-footer">
        <button
          className="btn btn-secondary"
          style={{ flex: 1, fontSize: "var(--text-xs)", height: "28px" }}
          onClick={() => openAt("#rules")}
        >
          Dashboard
        </button>
        <button
          className="btn btn-secondary"
          style={{ flex: 1, fontSize: "var(--text-xs)", height: "28px" }}
          onClick={() => openAt("#settings")}
        >
          Settings
        </button>
        {!loading && !session && (
          <button
            className="btn btn-secondary popup-locked-in-start"
            onClick={() => openAt("#locked-in")}
          >
            Lock In
          </button>
        )}
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
