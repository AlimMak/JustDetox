import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./options.css";
import { useSettings } from "./hooks/useSettings";
import { Sidebar, type Section } from "./components/Sidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { GroupsPanel } from "./components/GroupsPanel";
import { SitesPanel } from "./components/SitesPanel";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { AboutPanel } from "./components/AboutPanel";

function Options() {
  const [section, setSection] = useState<Section>("settings");
  const { settings, loading, patch } = useSettings();

  if (loading) {
    return <div className="options-loading">Loading…</div>;
  }

  return (
    <div className="options-root">
      <Sidebar
        active={section}
        onSelect={setSection}
        extensionDisabled={settings.disabled}
      />

      <main className="options-panel">
        {section === "settings" && (
          <SettingsPanel settings={settings} patch={patch} />
        )}
        {section === "groups" && (
          <GroupsPanel settings={settings} patch={patch} />
        )}
        {section === "sites" && (
          <SitesPanel settings={settings} patch={patch} />
        )}
        {section === "import-export" && (
          <ImportExportPanel settings={settings} patch={patch} />
        )}
        {section === "about" && <AboutPanel />}
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
