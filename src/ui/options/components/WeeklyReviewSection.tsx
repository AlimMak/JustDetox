import type { DailyProgress, Settings } from "../../../core/types";
import { formatTime } from "../../popup/utils/formatTime";
import { weeklyReview } from "../utils/weeklyReview";

interface WeeklyReviewSectionProps {
  history: DailyProgress[];
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

export function WeeklyReviewSection({ history, settings, patch }: WeeklyReviewSectionProps) {
  const { current, previous } = weeklyReview(history);
  const goalSeconds = settings.weeklyFocusGoalMinutes * 60;
  const progress = goalSeconds > 0
    ? Math.min(100, Math.round(current.focusSeconds / goalSeconds * 100))
    : 0;

  return (
    <section className="panel-section">
      <p className="section-heading">This week</p>
      <p className="field__hint" style={{ marginBottom: "var(--sp-3)" }}>
        Focus time counts allowed sites while Locked In or Focus Environment is active. All figures stay on this device.
      </p>
      <div className="stat-row" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="stat-card"><span className="stat-card__label">Focus time</span>
          <span className="stat-card__value tabular">{formatTime(current.focusSeconds)}</span></div>
        <div className="stat-card"><span className="stat-card__label">Tracked browsing</span>
          <span className="stat-card__value tabular">{formatTime(current.activeSeconds)}</span></div>
        <div className="stat-card"><span className="stat-card__label">Blocked attempts</span>
          <span className="stat-card__value tabular">{current.blockedAttempts}</span></div>
      </div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="field__label" htmlFor="weekly-goal">Weekly focus goal (minutes)</label>
        <input id="weekly-goal" className="input" type="number" min={0} max={10080} step={15}
          value={settings.weeklyFocusGoalMinutes}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) {
              patch({ weeklyFocusGoalMinutes: Math.min(10080, Math.max(0, Math.round(value))) });
            }
          }} />
      </div>
      {goalSeconds > 0 && (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <div className="progress-history__track" role="progressbar" aria-label="Weekly focus goal"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="progress-history__fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="field__hint" style={{ marginTop: "var(--sp-2)" }}>
            {progress}% of {formatTime(goalSeconds)} goal
          </p>
        </div>
      )}
      <p className="field__hint" style={{ marginTop: "var(--sp-3)" }}>
        Last week: {formatTime(previous.focusSeconds)} focus time, {previous.blockedAttempts} blocked attempts
      </p>
    </section>
  );
}
