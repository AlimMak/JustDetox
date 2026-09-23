// FILE: src/ui/options/components/DashboardPanel.tsx

import { useDashboard } from "../hooks/useDashboard";
import { useState } from "react";
import { BarChart } from "./BarChart";
import { DopamineScoreCard } from "./DopamineScoreCard";
import { SelfControlSection } from "./SelfControlSection";
import type { Settings } from "../../../core/types";
import { formatTime } from "../../popup/utils/formatTime";
import { useFriction } from "../context/FrictionContext";
import { ProgressHistorySection } from "./ProgressHistorySection";
import { sendBackgroundCommand } from "../utils/backgroundCommand";

interface DashboardPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings> | ((prev: Settings) => Settings)) => void;
  lockedInActive?: boolean;
  onOpenSite?: (hostname: string) => void;
}

export function DashboardPanel({ settings, patch, lockedInActive, onOpenSite }: DashboardPanelProps) {
  const { domainStats, groupStats, temptationStats, totalSeconds, dopamineScore, history, loading, error, refresh } =
    useDashboard(settings);
  const { askFriction } = useFriction();
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);

  const handleClear = async () => {
    const ok = await askFriction({
      actionType: "clear-tracked-data",
      label: "Delete local tracking data",
      context: ["Active time limits will reset for the current window."],
    });
    if (!ok) return;
    setClearing(true);
    setClearError(null);
    try {
      const result = await sendBackgroundCommand({ type: "CLEAR_TRACKED_DATA" });
      if (!result.ok) {
        setClearError(result.error ?? "Could not delete tracked data. Try again.");
        return;
      }
      await refresh();
      setDataRevision((revision) => revision + 1);
    } finally {
      setClearing(false);
    }
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {lockedInActive && (
            <span className="dashboard-locked-in-badge">Locked In Mode</span>
          )}
          <button
            className="btn btn-secondary btn--sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>
      {error && <p className="field__error" role="alert">{error}</p>}

      {/* Dopamine Score */}
      {!loading && <DopamineScoreCard data={dopamineScore} />}

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
            <span className="stat-card__label">Tracked in current windows</span>
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
          <p className="section-heading">Top sites in current windows</p>
          <p className="field__hint" style={{ marginBottom: "var(--sp-3)" }}>
            Each site&apos;s {settings.resetWindow.intervalHours}h window starts when it is first visited. Select a site to add or edit its rule.
          </p>
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
            onItemClick={onOpenSite}
          />
        )}
      </section>

      {/* Most tempting sites */}
      {!loading && temptationStats.length > 0 && (
        <section className="panel-section">
          <p className="section-heading">Most tempting sites</p>
          <p style={{ color: "var(--text-3)", fontSize: "var(--text-sm)", marginBottom: "var(--sp-3)" }}>
            Sites you tried to open the most this window.
          </p>
          <div className="rule-card-list">
            {temptationStats.map((t, i) => (
              <div key={t.hostname} className="list-row">
                <div className="list-row__main">
                  <span className="list-row__title" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
                    {i + 1}. {t.hostname}
                  </span>
                  {t.lockedInAttempts > 0 && (
                    <span className="list-row__sub">
                      {t.lockedInAttempts} during Locked In
                    </span>
                  )}
                </div>
                <span style={{ color: "var(--text-2)", fontSize: "var(--text-sm)", fontVariantNumeric: "tabular-nums" }}>
                  {t.attempts} {t.attempts === 1 ? "attempt" : "attempts"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Self-Control Graph */}
      {!loading && <SelfControlSection key={dataRevision} />}

      {!loading && (
        <ProgressHistorySection
          history={history}
          clearing={clearing}
          clearError={clearError}
          onClear={() => void handleClear()}
        />
      )}

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
                sublabel: [
                  g.mode === "limit"
                    ? `${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""} · ${settings.groups.find((x) => x.id === g.groupId)?.limitMinutes ?? 0}min limit`
                    : `${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""} · blocked`,
                  g.totalAttempts > 0
                    ? `${g.totalAttempts} temptation${g.totalAttempts !== 1 ? "s" : ""}`
                    : "",
                ].filter(Boolean).join(" · "),
              }))}
              emptyMessage="No group usage this window."
            />
          )}
        </section>
      )}
    </div>
  );
}
