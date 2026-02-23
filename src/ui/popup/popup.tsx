import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { readStorage } from "../../shared/storage";
import type { BlockedSite } from "../../shared/types";
import "../shared.css";

function Popup() {
  const [blockedSites, setBlockedSites] = useState<BlockedSite[]>([]);

  useEffect(() => {
    readStorage().then((s) => setBlockedSites(s.blockedSites));
  }, []);

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="popup-root">
      <header className="popup-header">
        <span className="popup-logo">JustDetox</span>
        <button className="btn-ghost" onClick={openOptions} title="Settings">
          ⚙
        </button>
      </header>

      <main className="popup-body">
        {blockedSites.length === 0 ? (
          <p className="muted">No sites configured yet.</p>
        ) : (
          <ul className="site-list">
            {blockedSites.map((site) => (
              <li key={site.hostname} className="site-row">
                <span className="site-name">{site.hostname}</span>
                <span className="site-badge">{site.mode === "block" ? "Blocked" : "Timed"}</span>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="popup-footer">
        <button className="btn-primary" onClick={openOptions}>
          Manage sites
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
