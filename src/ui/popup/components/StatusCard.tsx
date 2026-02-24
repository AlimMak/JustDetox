import type { SiteMode } from "../hooks/useSiteStatus";

interface StatusCardProps {
  hostname: string | null;
  mode: SiteMode;
  loading: boolean;
}

const BADGE_CLASSES: Record<SiteMode, string> = {
  blocked: "popup-badge popup-badge--blocked",
  "time-limited": "popup-badge popup-badge--limited",
  unrestricted: "popup-badge popup-badge--unrestricted",
};

const BADGE_LABELS: Record<SiteMode, string> = {
  blocked: "Blocked",
  "time-limited": "Time-limited",
  unrestricted: "Unrestricted",
};

export function StatusCard({ hostname, mode, loading }: StatusCardProps) {
  if (loading) return null;

  return (
    <div className="popup-status-card">
      <span className="popup-domain" title={hostname ?? ""}>
        {hostname ?? "No active site"}
      </span>
      <span className={BADGE_CLASSES[mode]}>{BADGE_LABELS[mode]}</span>
    </div>
  );
}
