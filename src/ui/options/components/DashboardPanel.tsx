import { useDashboard } from "../hooks/useDashboard";
import { BarChart } from "./BarChart";
import type { Settings } from "../../../core/types";
import { formatTime } from "../../popup/utils/formatTime";

interface DashboardPanelProps {
  settings: Settings;
}

export function DashboardPanel({ settings }: DashboardPanelProps) {
  const { domainStats, groupStats, totalSeconds, loading, refresh } =
    useDashboard(settings);

  const { intervalHours } = settings.resetWindow;
  const hasGroups = settings.groups.length > 0;

  return (
    <div className="panel-content">
      {/* Header */}
      <div className="panel-title-row">
        <div>
          <h1 className="panel-title">Dashboard</h1>
          <p className="panel-subtitle">
            Usage in the current {intervalHours}h window.
          </p>
        </div>
        <button
          className="btn-secondary btn-sm"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh stats"
        >
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      {/* Total summary row */}
      {!loading && totalSeconds > 0 && (
        <div className="dash-summary">
          <span className="dash-summary-label">Total tracked</span>
          <span className="dash-summary-value">{formatTime(totalSeconds)}</span>
        </div>
      )}

      {/* Top sites */}
      <section className="panel-section">
        <p className="panel-section-title">Top sites</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <BarChart
            items={domainStats.map((d) => ({
              label: d.hostname,
              value: d.activeSeconds,
            }))}
            emptyMessage="No site visits recorded yet. Browse a few pages and refresh."
          />
        )}
      </section>

      {/* Groups */}
      {hasGroups && (
        <section className="panel-section">
          <p className="panel-section-title">Groups</p>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <BarChart
              items={groupStats.map((g) => ({
                label: g.name,
                value: g.activeSeconds,
                sublabel:
                  g.mode === "limit"
                    ? `${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""} · limit: ${settings.groups.find((x) => x.id === g.groupId)?.limitMinutes ?? 0} min`
                    : `${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""} · blocked`,
              }))}
              emptyMessage="No group usage recorded yet."
            />
          )}
        </section>
      )}

      {/* Hint when extension is disabled */}
      {settings.disabled && (
        <p className="muted" style={{ marginTop: 8 }}>
          The extension is currently disabled — new time is not being tracked.
        </p>
      )}
    </div>
  );
}
