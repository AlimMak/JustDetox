// FILE: src/ui/options/options.tsx

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles/base.css";
import "../components/components.css";
import "./options.css";
import { useSettings } from "./hooks/useSettings";
import { useFrictionGate } from "./hooks/useFrictionGate";
import { FrictionContext } from "./context/FrictionContext";
import { FrictionGate } from "../components/FrictionGate";
import { Sidebar, resolveInitialSection, type Section } from "./components/Sidebar";
import { DashboardPanel } from "./components/DashboardPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { GroupsPanel } from "./components/GroupsPanel";
import { SitesPanel } from "./components/SitesPanel";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { AboutPanel } from "./components/AboutPanel";

function Options() {
  // Initialise from location.hash so popup deep-links work (#rules, #settings, …)
  const [section, setSection] = useState<Section>(resolveInitialSection);
  const { settings, loading, patch } = useSettings();
  const { askFriction, gateState, gateHandlers } = useFrictionGate(
    settings.friction,
  );

  if (loading) {
    return <div className="options-loading">Loading…</div>;
  }

  return (
    <FrictionContext.Provider value={{ askFriction }}>
      <div className="options-root">
        <Sidebar
          active={section}
          onSelect={setSection}
          extensionDisabled={settings.disabled}
        />

        <main className="options-panel">
          {section === "rules" && (
            <DashboardPanel settings={settings} patch={patch} />
          )}
          {section === "settings" && (
            <SettingsPanel settings={settings} patch={patch} />
          )}
          {section === "groups" && (
            <GroupsPanel settings={settings} patch={patch} />
          )}
          {section === "sites" && (
            <SitesPanel settings={settings} patch={patch} />
          )}
          {section === "reset-window" && (
            <SettingsPanel settings={settings} patch={patch} />
          )}
          {section === "import-export" && (
            <ImportExportPanel settings={settings} patch={patch} />
          )}
          {section === "about" && <AboutPanel />}
        </main>
      </div>

      {/* Friction Gate renders above everything when active */}
      {gateState && (
        <FrictionGate
          payload={gateState.payload}
          countdownStartTs={gateState.countdownStartTs}
          showReflection={gateState.showReflection}
          requireReflection={gateState.requireReflection}
          onApply={gateHandlers.onApply}
          onKeep={gateHandlers.onKeep}
        />
      )}
    </FrictionContext.Provider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
