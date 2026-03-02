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
  const { score, previousWindowScore } = data;
  const status = getScoreStatus(score);

  const delta = Math.round((score - previousWindowScore) * 10) / 10;
  const deltaStr =
    delta > 0 ? `+${delta} vs last window` :
    delta < 0 ? `${delta} vs last window` :
    "same as last window";

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
    </div>
  );
}
