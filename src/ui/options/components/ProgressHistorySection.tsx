import type { DailyProgress } from "../../../core/history";
import { formatTime } from "../../popup/utils/formatTime";

interface ProgressHistorySectionProps {
  history: DailyProgress[];
  clearing: boolean;
  clearError: string | null;
  onClear: () => void;
}

function recentDays(history: DailyProgress[]): DailyProgress[] {
  const byDate = new Map(history.map((day) => [day.date, day]));
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return byDate.get(key) ?? { date: key, activeSeconds: 0, blockedAttempts: 0, score: null };
  });
}

export function ProgressHistorySection({ history, clearing, clearError, onClear }: ProgressHistorySectionProps) {
  const days = recentDays(history);
  const maxSeconds = Math.max(...days.map((day) => day.activeSeconds), 1);

  return (
    <section className="panel-section">
      <p className="section-heading">Last 7 days</p>
      <p className="field__hint" style={{ marginBottom: "var(--sp-3)" }}>
        Local daily totals from this version onward. The chart shows seven days; older entries are removed as new activity is recorded.
      </p>
      {history.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__heading">No history yet.</p>
          <p className="empty-state__body">Browse normally and return to see your daily progress.</p>
        </div>
      ) : (
        <div className="progress-history" role="list" aria-label="Daily progress for the last seven days">
          {days.map((day) => {
            const date = new Date(`${day.date}T12:00:00`);
            return (
              <div className="progress-history__row" role="listitem" key={day.date}>
                <span className="progress-history__date">
                  {date.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })}
                </span>
                <div className="progress-history__track" aria-hidden="true">
                  <div className="progress-history__fill" style={{ width: `${day.activeSeconds > 0 ? Math.max(2, day.activeSeconds / maxSeconds * 100) : 0}%` }} />
                </div>
                <span className="progress-history__value">{formatTime(day.activeSeconds)}</span>
                <span className="progress-history__meta">
                  {day.blockedAttempts} blocked · score {day.score === null ? "—" : Math.round(day.score)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: "var(--sp-4)" }}>
        <button className="btn btn-danger btn--sm" disabled={clearing} onClick={onClear}>
          {clearing ? "Deleting…" : "Delete tracked data"}
        </button>
        <p className="field__hint" style={{ marginTop: "var(--sp-2)" }}>
          Removes usage, attempts, score, history, and local reflection notes. Active time limits reset; site and group rules stay in place.
        </p>
        {clearError && <p className="field__error" role="alert">{clearError}</p>}
      </div>
    </section>
  );
}
