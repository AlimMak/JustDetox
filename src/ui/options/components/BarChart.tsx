// FILE: src/ui/options/components/BarChart.tsx

import { formatTime } from "../../popup/utils/formatTime";

export interface BarChartItem {
  label: string;
  /** Active seconds — used to compute bar width and display value. */
  value: number;
  /** Optional second line (e.g. "3 domains", "limit: 60 min"). */
  sublabel?: string;
}

// Legacy alias kept for backward compatibility with existing imports.
export type BarItem = BarChartItem;

interface BarChartProps {
  items: BarChartItem[];
  emptyMessage: string;
}

/**
 * Pure CSS horizontal bar chart — no canvas, no external library.
 *
 * The widest bar is always 100%; all others are scaled proportionally.
 * Values are shown as formatted time strings on the right.
 */
export function BarChart({ items, emptyMessage }: BarChartProps) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>
        {emptyMessage}
      </p>
    );
  }

  const top5 = items.slice(0, 5);
  const max = Math.max(...top5.map((i) => i.value), 1);

  return (
    <div className="bar-list">
      {top5.map((item, idx) => (
        <div key={item.label} className="bar-item">
          <div>
            <div className="bar-item__label truncate">{item.label}</div>
            {item.sublabel && (
              <div className="bar-item__sublabel">{item.sublabel}</div>
            )}
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill${idx === 0 ? " bar-fill--top" : ""}`}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
          <div className="bar-item__value">{formatTime(item.value)}</div>
        </div>
      ))}
    </div>
  );
}
