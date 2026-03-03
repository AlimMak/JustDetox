/**
 * SelfControlChart — Monochrome SVG bar chart for temptation spike visualization.
 *
 * Design constraints:
 *  - Grays only, no gradients, no glow, no color.
 *  - Sparse x-axis ticks (HH:MM), y-axis count labels (0 and max).
 *  - Responsive: SVG uses viewBox, width 100% in container.
 *  - Linear/Raycast style: crisp, minimal, readable.
 */

import type { BucketPoint } from "../../core/selfControl";

// ─── Chart constants ──────────────────────────────────────────────────────────

const CHART_W = 540;
const CHART_H = 100;
const PAD = { top: 8, right: 4, bottom: 22, left: 26 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

/** Maximum number of x-axis tick labels to show. */
const MAX_X_TICKS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SelfControlChartProps {
  buckets: BucketPoint[];
}

export function SelfControlChart({ buckets }: SelfControlChartProps) {
  if (buckets.length === 0) {
    return (
      <div className="scg-chart-empty">No events recorded yet.</div>
    );
  }

  const n = buckets.length;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  // Slot width: each bucket gets equal horizontal space.
  const slotW = INNER_W / n;
  // Bar fills 70% of slot; minimum 1px to be visible.
  const barW = Math.max(1, slotW * 0.7);

  // X-axis tick interval: show at most MAX_X_TICKS evenly spaced labels.
  const tickInterval = Math.max(1, Math.ceil(n / MAX_X_TICKS));

  // Y-axis: show 0, midpoint (if max > 1), and max.
  const yLabels: { value: number; y: number }[] = [
    { value: 0, y: PAD.top + INNER_H },
    { value: maxCount, y: PAD.top },
  ];
  if (maxCount > 2) {
    const mid = Math.round(maxCount / 2);
    yLabels.push({ value: mid, y: PAD.top + INNER_H * (1 - mid / maxCount) });
  }

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Y-axis line */}
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + INNER_H}
        stroke="#1c1c1c"
        strokeWidth="1"
      />

      {/* X-axis baseline */}
      <line
        x1={PAD.left}
        y1={PAD.top + INNER_H}
        x2={PAD.left + INNER_W}
        y2={PAD.top + INNER_H}
        stroke="#1c1c1c"
        strokeWidth="1"
      />

      {/* Y-axis labels */}
      {yLabels.map(({ value, y }) => (
        <text
          key={value}
          x={PAD.left - 4}
          y={y + 3}
          textAnchor="end"
          style={{
            fill: "#3a3a3a",
            fontSize: "9px",
            fontFamily: "ui-monospace, monospace",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </text>
      ))}

      {/* Bars */}
      {buckets.map((b, i) => {
        const barH = b.count === 0 ? 0 : Math.max(1, (b.count / maxCount) * INNER_H);
        const x = PAD.left + i * slotW + (slotW - barW) / 2;
        const y = PAD.top + INNER_H - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            style={{ fill: "#2e2e2e" }}
          />
        );
      })}

      {/* X-axis tick labels */}
      {buckets
        .map((b, i) => ({ b, i }))
        .filter(({ i }) => i % tickInterval === 0 || i === n - 1)
        .map(({ b, i }) => {
          const x = PAD.left + i * slotW + slotW / 2;
          return (
            <text
              key={i}
              x={x}
              y={PAD.top + INNER_H + 14}
              textAnchor="middle"
              style={{
                fill: "#3a3a3a",
                fontSize: "9px",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {formatHHMM(b.bucketStart)}
            </text>
          );
        })}
    </svg>
  );
}
