import type { SiteMode } from "../hooks/useSiteStatus";
import { formatTime } from "../utils/formatTime";

interface TimeDisplayProps {
  mode: SiteMode;
  activeSeconds: number;
  remainingSeconds: number | null;
}

export function TimeDisplay({ mode, activeSeconds, remainingSeconds }: TimeDisplayProps) {
  if (mode === "blocked") {
    return (
      <div className="popup-time-section">
        <p className="popup-time-blocked">This site is blocked.</p>
      </div>
    );
  }

  const hasUsage = activeSeconds > 0;

  return (
    <div className="popup-time-section">
      <div className="popup-time-row">
        <span className="popup-time-label">Time used today</span>
        <span className="popup-time-value">
          {hasUsage ? formatTime(activeSeconds) : "—"}
        </span>
      </div>

      {mode === "time-limited" && remainingSeconds !== null && (
        <div className="popup-time-row">
          <span className="popup-time-label">Remaining</span>
          <span className={`popup-time-value${remainingSeconds <= 0 ? " popup-time-value--zero" : ""}`}>
            {remainingSeconds > 0 ? formatTime(remainingSeconds) : "None"}
          </span>
        </div>
      )}
    </div>
  );
}
