import { formatTime } from "../../popup/utils/formatTime";

export interface BarItem {
  label: string;
  /** Active seconds — used to compute bar width and display value. */
  value: number;
  /** Optional second line (e.g. "3 domains", "limit: 60 min"). */
  sublabel?: string;
}

interface BarChartProps {
  items: BarItem[];
  emptyMessage?: string;
}

/**
 * Pure CSS horizontal bar chart — no canvas, no external library.
 *
 * The widest bar is always 100%; all others are scaled proportionally.
 * Values are shown as formatted time strings on the right.
 */
export function BarChart({ items, emptyMessage = "No data yet." }: BarChartProps) {
  if (items.length === 0) {
    return <p className="muted dash-empty">{emptyMessage}</p>;
  }

  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="bar-chart" role="list">
      {items.map((item, idx) => {
        const pct = Math.max((item.value / maxValue) * 100, 1);

        return (
          <li key={item.label} className="bar-row">
            <div className="bar-label-group">
              <span className="bar-label" title={item.label}>
                {item.label}
              </span>
              {item.sublabel && (
                <span className="bar-sublabel">{item.sublabel}</span>
              )}
            </div>

            <div className="bar-track" aria-hidden="true">
              <div
                className={`bar-fill${idx === 0 ? " bar-fill--top" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <span className="bar-value">{formatTime(item.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
