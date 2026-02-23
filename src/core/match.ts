/**
 * JustDetox — hostname normalization and matching utilities.
 *
 * Kept as pure functions with no side effects so they are trivially testable
 * and importable from both the service worker and the UI.
 */

/**
 * Normalize a raw hostname to a canonical form suitable for comparison:
 *  - Trim surrounding whitespace
 *  - Convert to lowercase
 *  - Strip a trailing dot (FQDN dot, e.g. "example.com." → "example.com")
 *
 * @example
 *   normalizeHostname("  YouTube.COM. ") → "youtube.com"
 *   normalizeHostname("M.TWITTER.COM")   → "m.twitter.com"
 */
export function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Returns `true` if `pageHost` is exactly `configuredHost` OR a subdomain of it.
 *
 * Both arguments must already be normalized (lowercase, no trailing dot).
 * The check is structural: it requires a full label boundary, so
 * `"xnyoutube.com"` does NOT match a rule for `"youtube.com"`.
 *
 * @example
 *   domainCovers("youtube.com",            "youtube.com")   → true
 *   domainCovers("m.youtube.com",          "youtube.com")   → true
 *   domainCovers("accounts.google.com",    "google.com")    → true  (deep subdomain)
 *   domainCovers("xnyoutube.com",          "youtube.com")   → false (not a subdomain)
 *   domainCovers("youtube.com",            "m.youtube.com") → false (parent ≠ child rule)
 */
export function domainCovers(pageHost: string, configuredHost: string): boolean {
  if (pageHost === configuredHost) return true;
  return pageHost.endsWith(`.${configuredHost}`);
}

/**
 * Returns `true` if `hostname` (normalized internally) matches any entry
 * in `domains` via `domainCovers`.
 *
 * Normalizes both the input hostname and each domain before comparing.
 */
export function matchesAny(hostname: string, domains: readonly string[]): boolean {
  const norm = normalizeHostname(hostname);
  return domains.some((d) => domainCovers(norm, normalizeHostname(d)));
}

/**
 * Sum `activeSeconds` across all usage entries whose key falls under
 * `configuredDomain` (exact match or subdomain).
 *
 * Used when computing used time for a rule — the tracker records usage
 * under the real page hostname (e.g. `"m.youtube.com"`), but the rule
 * is configured for the parent domain (`"youtube.com"`).
 *
 * @example
 *   // usage = { "youtube.com": 600, "m.youtube.com": 300 }
 *   sumUsageUnder("youtube.com", usage) → 900
 */
export function sumUsageUnder(
  configuredDomain: string,
  usage: Readonly<Record<string, { activeSeconds: number }>>,
): number {
  const norm = normalizeHostname(configuredDomain);
  return Object.entries(usage).reduce(
    (total, [key, val]) =>
      domainCovers(normalizeHostname(key), norm) ? total + val.activeSeconds : total,
    0,
  );
}
