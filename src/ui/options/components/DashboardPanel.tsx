// FILE: src/ui/options/components/DashboardPanel.tsx

import { useDashboard } from "../hooks/useDashboard";
import { BarChart } from "./BarChart";
import type { Settings } from "../../../core/types";
import { formatTime } from "../../popup/utils/formatTime";
import { useFriction } from "../context/FrictionContext";

interface DashboardPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings> | ((prev: Settings) => Settings)) => void;
}

export function DashboardPanel({ settings, patch }: DashboardPanelProps) {
  const { domainStats, groupStats, totalSeconds, loading, refresh } =
    useDashboard(settings);
  const { askFriction } = useFriction();

  const handleDisableToggle = async () => {
    // Only gate the action when the extension is currently ENABLED (i.e. user is disabling it).
    if (!settings.disabled) {
      const ok = await askFriction({
        actionType: "disable-extension",
        label: "Extension — master toggle",
      });
      if (!ok) return;
    }
    patch({ disabled: !settings.disabled });
  };

  return (
    <div className="panel-content">
      {/* Header row: title + refresh */}
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Rules</h1>
          <p className="panel-subtitle">Overview of your blocking rules and usage this window.</p>
        </div>
        <button
          className="btn btn-secondary btn--sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Master toggle card */}
      <div
        className={`master-toggle-card${settings.disabled ? " disabled" : ""}`}
        style={{ marginBottom: "var(--sp-6)" }}
      >
        <div>
          <p className="master-toggle-label">
            {settings.disabled ? "Extension disabled" : "Extension enabled"}
          </p>
          <p className="master-toggle-sub">
            {settings.disabled
              ? "No sites are blocked or tracked."
              : "Sites are blocked per your rules."}
          </p>
        </div>
        <label className="toggle">
          <input
            className="toggle__input"
            type="checkbox"
            checked={!settings.disabled}
            onChange={() => void handleDisableToggle()}
          />
          <span className="toggle__track"><span className="toggle__thumb" /></span>
        </label>
      </div>

      {/* Stats row */}
      {!loading && (
        <div className="stat-row" style={{ marginBottom: "var(--sp-6)" }}>
          <div className="stat-card">
            <span className="stat-card__label">Groups</span>
            <span className="stat-card__value tabular">{settings.groups.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Site rules</span>
            <span className="stat-card__value tabular">{settings.siteRules.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Tracked today</span>
            <span className="stat-card__value tabular">{formatTime(totalSeconds)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Window</span>
            <span className="stat-card__value tabular">{settings.resetWindow.intervalHours}h</span>
          </div>
        </div>
      )}

      {/* Top sites */}
      <section className="panel-section">
        <p className="section-heading">Top sites this window</p>
        {loading ? (
          <p style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>Loading…</p>
        ) : domainStats.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__heading">No data yet.</p>
            <p className="empty-state__body">Browse some sites and refresh to see usage stats.</p>
          </div>
        ) : (
          <BarChart
            items={domainStats.map((d) => ({ label: d.hostname, value: d.activeSeconds }))}
            emptyMessage=""
          />
        )}
      </section>

      {/* Groups summary — only if groups exist */}
      {settings.groups.length > 0 && (
        <section className="panel-section">
          <p className="section-heading">Groups</p>
          {loading ? (
            <p style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>Loading…</p>
          ) : (
            <BarChart
              items={groupStats.map((g) => ({
                label: g.name,
                value: g.activeSeconds,
                sublabel:
                  g.mode === "limit"
                    ? `${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""} · ${settings.groups.find((x) => x.id === g.groupId)?.limitMinutes ?? 0}min limit`
                    : `${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""} · blocked`,
              }))}
              emptyMessage="No group usage this window."
            />
          )}
        </section>
      )}
    </div>
  );
}
