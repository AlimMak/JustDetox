/**
 * JustDetox — Dopamine Score card for the dashboard.
 *
 * Displays the score as a large numeric figure with a status label and
 * window delta. Monochrome, no animations, no gamification.
 */

import type { DopamineScoreData } from "../../../core/types";
import { getScoreStatus } from "../../../core/dopamine";

interface DopamineScoreCardProps {
  data: DopamineScoreData;
}

export function DopamineScoreCard({ data }: DopamineScoreCardProps) {
  const { score, previousWindowScore, scoreBreakdown } = data;
  const status = getScoreStatus(score);

  const delta = Math.round((score - previousWindowScore) * 10) / 10;
  const deltaStr =
    delta > 0 ? `+${delta} vs last window` :
    delta < 0 ? `${delta} vs last window` :
    "same as last window";
  const points = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <div className="dopamine-score-card">
      <div className="dopamine-score-number">
        {Math.round(score)}
      </div>
      <div className="dopamine-score-label">Dopamine Score</div>
      <div className="dopamine-score-meta">
        <span className="dopamine-score-delta">{deltaStr}</span>
        <span className="dopamine-score-sep">·</span>
        <span className="dopamine-score-status">{status}</span>
      </div>
      <div className="dopamine-score-breakdown" aria-label="Score calculation">
        <div><span>Starting score</span><strong>100</strong></div>
        <div><span>Blocked site attempts</span><strong>−{points(scoreBreakdown.temptationPenalty)}</strong></div>
        <div><span>Limited site time and limit hits</span><strong>−{points(scoreBreakdown.timePenalty)}</strong></div>
        <div><span>Completed Locked In sessions</span><strong>+{points(scoreBreakdown.lockedInBonus)}</strong></div>
        <div><span>Completed delays</span><strong>+{points(scoreBreakdown.delayBonus)}</strong></div>
      </div>
      <p className="field__hint" style={{ marginTop: "var(--sp-3)" }}>
        The total is capped between 0 and 100. Time on a limited site costs 0.5 points per minute; hitting a site limit costs 5 points.
      </p>
    </div>
  );
}
