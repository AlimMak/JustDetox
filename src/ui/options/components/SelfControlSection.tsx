/**
 * SelfControlSection — "Self-Control Graph" panel for the Dashboard.
 *
 * Shows:
 *  - SVG bar chart of temptation spikes bucketed over time.
 *  - Bucket size selector (5 / 15 / 30 / 60 minutes).
 *  - Top 3 spike intervals with time and count.
 *  - Top 5 most tempting domains.
 */

import { useSelfControl } from "../hooks/useSelfControl";
import { SelfControlChart } from "../../components/SelfControlChart";
import type { BucketSize } from "../hooks/useSelfControl";

const BUCKET_OPTIONS: { size: BucketSize; label: string }[] = [
  { size: 5, label: "5m" },
  { size: 15, label: "15m" },
  { size: 30, label: "30m" },
  { size: 60, label: "60m" },
];

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

export function SelfControlSection() {
  const {
    buckets,
    topSpikes,
    topDomains,
    totalEvents,
    bucketMinutes,
    setBucketMinutes,
    loading,
    refresh,
  } = useSelfControl();

  return (
    <section className="panel-section">
      {/* Section header */}
      <div className="scg-header">
        <div>
          <p className="section-heading">Self-Control Graph</p>
          <p className="scg-subtitle">Temptation spikes this window</p>
        </div>
        <div className="scg-controls">
          {BUCKET_OPTIONS.map(({ size, label }) => (
            <button
              key={size}
              className={`scg-bucket-btn${bucketMinutes === size ? " active" : ""}`}
              onClick={() => setBucketMinutes(size)}
            >
              {label}
            </button>
          ))}
          <button
            className="btn btn-secondary btn--sm"
            onClick={() => void refresh()}
            disabled={loading}
            style={{ marginLeft: "var(--sp-2)" }}
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="scg-chart-container">
        {loading ? (
          <div className="scg-chart-empty">Loading…</div>
        ) : (
          <SelfControlChart buckets={buckets} />
        )}
      </div>

      {/* Top spike intervals */}
      {!loading && topSpikes.length > 0 && (
        <div className="scg-spikes">
          <p className="scg-meta-label">Top spike intervals</p>
          <div className="scg-spike-list">
            {topSpikes.map((s, i) => (
              <div key={s.bucketStart} className="scg-spike-row">
                <span className="scg-spike-rank">{i + 1}</span>
                <span className="scg-spike-time">{formatHHMM(s.bucketStart)}</span>
                <span className="scg-spike-count">
                  {s.count} {s.count === 1 ? "spike" : "spikes"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most tempting domains */}
      {!loading && topDomains.length > 0 && (
        <div className="scg-domains">
          <p className="scg-meta-label">Most tempting domains</p>
          <div className="rule-card-list">
            {topDomains.map((d, i) => (
              <div key={d.domain} className="list-row">
                <span
                  className="list-row__title"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  {i + 1}. {d.domain}
                </span>
                <span
                  style={{
                    color: "var(--text-2)",
                    fontSize: "var(--text-sm)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {d.count} {d.count === 1 ? "event" : "events"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && totalEvents === 0 && (
        <div className="empty-state">
          <p className="empty-state__heading">No events yet.</p>
          <p className="empty-state__body">
            Events are recorded when you try to visit blocked or time-limited
            sites. Trigger a blocked overlay to start building your graph.
          </p>
        </div>
      )}
    </section>
  );
}
