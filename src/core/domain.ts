/**
 * JustDetox — canonical domain normalization and matching.
 *
 * Two clear responsibilities:
 *
 *   normalizeDomain  — converts any user-supplied string (full URL, pasted
 *                      hostname, or already-clean domain) into a canonical
 *                      stored form. Used at write time (validation pipeline).
 *
 *   domainMatches    — runtime predicate: does a visited hostname fall under
 *                      a blocked/limited domain? Used by the policy engine and
 *                      anywhere a quick yes/no check is needed.
 *
 * Design notes
 * ────────────
 * • `normalizeDomain` strips the `www.` prefix so that a rule stored for
 *   "youtube.com" and a rule entered as "www.youtube.com" are treated
 *   identically. The matching layer handles subdomain coverage, so
 *   www.youtube.com is still blocked by a "youtube.com" rule regardless.
 *
 * • `domainMatches` does NOT strip `www.` from the runtime hostname — that
 *   would lose label information needed for exact-subdomain rules. Instead,
 *   the structural endsWith check (`hostname.endsWith("."+blocked)`) ensures
 *   www.youtube.com is matched by a "youtube.com" rule automatically.
 *
 * • Neither function throws. Invalid input produces an empty string that
 *   fails validation downstream.
 */

// ─── normalizeDomain ──────────────────────────────────────────────────────────

/**
 * Reduce any domain string to its canonical, comparable form.
 *
 * Steps applied in order:
 *  1. Trim surrounding whitespace
 *  2. Lowercase
 *  3. Strip protocol prefix (http:// or https://)
 *  4. Strip path, query-string, and fragment
 *  5. Strip port number
 *  6. Strip trailing FQDN dot
 *  7. Strip a leading "www." prefix
 *
 * This is the authoritative normalizer for **stored** domains — i.e. domains
 * entered by the user and persisted to settings. Runtime hostnames (from
 * `location.hostname`) are already clean and only need the lightweight
 * `normalizeHostname` from `match.ts`.
 *
 * @example
 *   normalizeDomain("https://www.youtube.com/watch?v=abc") → "youtube.com"
 *   normalizeDomain("  HTTP://REDDIT.COM/r/all  ")         → "reddit.com"
 *   normalizeDomain("www.twitter.com")                     → "twitter.com"
 *   normalizeDomain("m.youtube.com")                       → "m.youtube.com"
 *   normalizeDomain("studio.youtube.com")                  → "studio.youtube.com"
 *   normalizeDomain("youtube.com/shorts/abc")              → "youtube.com"
 *   normalizeDomain("youtube.com?query=1")                 → "youtube.com"
 *   normalizeDomain("YouTube.COM.")                        → "youtube.com"
 */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, ""); // strip protocol
  d = d.split("/")[0];               // strip path
  d = d.split("?")[0];               // strip query-string
  d = d.split("#")[0];               // strip fragment
  d = d.split(":")[0];               // strip port
  d = d.replace(/\.$/, "");          // strip trailing FQDN dot
  d = d.replace(/^www\./, "");       // strip leading www. prefix
  return d;
}

// ─── domainMatches ────────────────────────────────────────────────────────────

/**
 * Returns `true` if `hostname` falls under `blockedDomain` —
 * either an exact match or a subdomain of it.
 *
 * Both arguments are normalized internally so callers do not need to
 * pre-normalize. `www.` is stripped from both sides.
 *
 * The check enforces a full label boundary: `"xnyoutube.com"` does NOT
 * match a rule for `"youtube.com"`.
 *
 * @example
 *   domainMatches("youtube.com", "youtube.com")         → true  (exact)
 *   domainMatches("youtube.com", "www.youtube.com")     → true  (www treated as root)
 *   domainMatches("youtube.com", "m.youtube.com")       → true  (subdomain)
 *   domainMatches("youtube.com", "studio.youtube.com")  → true  (deep subdomain)
 *   domainMatches("youtube.com", "xnyoutube.com")       → false (no label boundary)
 *   domainMatches("youtube.com", "google.com")          → false (unrelated)
 */
export function domainMatches(blockedDomain: string, hostname: string): boolean {
  const blocked = normalizeDomain(blockedDomain);
  const norm = normalizeDomain(hostname);
  if (norm === blocked) return true;
  return norm.endsWith(`.${blocked}`);
}
