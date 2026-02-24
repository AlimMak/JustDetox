import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./popup.css";
import { useActiveTab } from "./hooks/useActiveTab";
import { useSiteStatus } from "./hooks/useSiteStatus";
import { StatusCard } from "./components/StatusCard";
import { TimeDisplay } from "./components/TimeDisplay";
import { NavButtons } from "./components/NavButtons";

function Popup() {
  const { hostname, loading: tabLoading, error: tabError } = useActiveTab();
  const status = useSiteStatus(tabLoading ? null : hostname);

  const loading = tabLoading || status.loading;

  return (
    <div className="popup-root">
      <header className="popup-header">
        <span className="popup-logo">JustDetox</span>
      </header>

      <main className="popup-body">
        {loading && (
          <div className="popup-loading">Loading…</div>
        )}

        {!loading && (tabError || status.error) && (
          <div className="popup-empty">
            <span>Could not load status</span>
          </div>
        )}

        {!loading && !tabError && !status.error && hostname === null && (
          <div className="popup-empty">
            <span>No active site</span>
          </div>
        )}

        {!loading && !tabError && !status.error && hostname !== null && (
          <>
            <StatusCard hostname={hostname} mode={status.mode} loading={false} />
            <TimeDisplay
              mode={status.mode}
              activeSeconds={status.activeSeconds}
              remainingSeconds={status.remainingSeconds}
            />
          </>
        )}
      </main>

      <footer className="popup-footer">
        <NavButtons />
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
