import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./popup.css";
import { useActiveTab } from "./hooks/useActiveTab";
import { useSiteStatus } from "./hooks/useSiteStatus";
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

function Popup() {
  const { hostname, loading: tabLoading, error: tabError } = useActiveTab();
  const status = useSiteStatus(tabLoading ? null : hostname);
  const loading = tabLoading || status.loading;

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
      </header>

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
