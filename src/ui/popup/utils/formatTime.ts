/**
 * Format a number of seconds into a compact human-readable string.
 *
 * Examples:
 *   0       → "0s"
 *   45      → "45s"
 *   90      → "1m 30s"
 *   3600    → "1h 0m"
 *   3661    → "1h 1m"
 *
 * When hours are present seconds are dropped (too noisy for the popup).
 */
export function formatTime(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
