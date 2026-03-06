/**
 * JustDetox — Compiled rule index for O(depth) domain lookup.
 *
 * # Problem
 * `resolveEffectivePolicy` originally scanned all site rules and groups on
 * every navigation check — O(n) work per request that grows linearly with the
 * number of rules the user adds.
 *
 * # Solution
 * `buildRuleIndex` compiles settings into Maps keyed by normalized domain.
 * `resolveDomainRule` then resolves a hostname in O(labels) time by probing
 * progressively shorter suffixes of the hostname against those Maps.
 *
 * # Caching
 * `getOrBuildIndex` caches the compiled index by settings object reference.
 * Because `getSettings()` produces a new object on every read (Zod parse),
 * the cache is effectively shared across multiple policy calls that originate
 * from the same settings load, and is naturally invalidated when settings
 * change (new object reference on the next read).
 *
 * # Precedence
 * The original precedence is preserved at the *tier* level:
 *   1. Site rules  — any site-rule match beats any group match
 *   2. Group rules — any group match beats the global block list
 *   3. Global block list
 *
 * Within a single tier, the *most specific* domain wins (longest label match
 * first). For example, if both "youtube.com" and "m.youtube.com" exist as
 * separate site rules, visiting "m.youtube.com" applies the more specific rule.
 * This differs from the original array-order preference only in this rare
 * overlapping-rule edge case — the more-specific behaviour is more intuitive.
 */

import type { Settings, SiteRule, SiteGroup } from "./types";
import { normalizeHostname } from "./match";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Compiled lookup structure produced by `buildRuleIndex`.
 *
 * Each Map is keyed by a **normalized** domain (lowercase, no trailing dot,
 * no protocol/path). Values are direct references to the original rule or
 * group objects from `settings` — no data is duplicated.
 */
export interface RuleIndex {
  /** Normalized domain → the first enabled SiteRule for that domain. */
  siteRules: Map<string, SiteRule>;
  /** Normalized domain → the first enabled SiteGroup that lists that domain. */
  groupRules: Map<string, SiteGroup>;
  /** Normalized domains in globalBlockList. */
  globalBlockDomains: Set<string>;
}

/** Discriminated union returned by `resolveDomainRule`. */
export type ResolvedRule =
  | { kind: "site"; rule: SiteRule }
  | { kind: "group"; group: SiteGroup }
  | { kind: "global-block" };

// ─── buildRuleIndex ───────────────────────────────────────────────────────────

/**
 * Compile `settings` into a lookup index.
 *
 * Pure function — produces a new `RuleIndex` from `settings` with no side
 * effects. Suitable for direct use in unit tests.
 *
 * Rules are inserted in array order; the first enabled entry for a given
 * normalized domain wins (preserving the original array-order precedence
 * for exact-same-domain conflicts).
 *
 * Time complexity: O(r + g·d + b) where r = siteRules count,
 * g = groups count, d = average domains per group, b = globalBlockList size.
 */
export function buildRuleIndex(settings: Settings): RuleIndex {
  const siteRules = new Map<string, SiteRule>();
  const groupRules = new Map<string, SiteGroup>();
  const globalBlockDomains = new Set<string>();

  for (const rule of settings.siteRules) {
    if (!rule.enabled) continue;
    const norm = normalizeHostname(rule.domain);
    if (!siteRules.has(norm)) siteRules.set(norm, rule);
  }

  for (const group of settings.groups) {
    if (!group.enabled) continue;
    for (const domain of group.domains) {
      const norm = normalizeHostname(domain);
      if (!groupRules.has(norm)) groupRules.set(norm, group);
    }
  }

  for (const domain of settings.globalBlockList) {
    globalBlockDomains.add(normalizeHostname(domain));
  }

  return { siteRules, groupRules, globalBlockDomains };
}

// ─── resolveDomainRule ────────────────────────────────────────────────────────

/**
 * Resolve the applicable rule for `hostname` using the compiled index.
 *
 * Algorithm
 * ---------
 * Split the normalized hostname into labels and probe progressively shorter
 * suffixes against the index:
 *
 *   "studio.youtube.com" → probe "studio.youtube.com", "youtube.com", "com"
 *
 * Tiers are checked exhaustively before advancing: all suffix levels are
 * checked for site rules before any suffix level is checked for group rules.
 * This ensures the original tier precedence (site > group > global-block) is
 * preserved regardless of specificity.
 *
 * Time complexity: O(labels) per tier, typically O(3–5) total.
 *
 * @param hostname  The page hostname (normalized internally — no pre-processing needed).
 * @param index     The compiled index from `buildRuleIndex` or `getOrBuildIndex`.
 *
 * @example
 *   // index has siteRules: { "youtube.com" → block rule }
 *   resolveDomainRule("studio.youtube.com", index)
 *   // probes "studio.youtube.com" (miss), then "youtube.com" (hit)
 *   // → { kind: "site", rule: <block rule> }
 */
export function resolveDomainRule(hostname: string, index: RuleIndex): ResolvedRule | null {
  const norm = normalizeHostname(hostname);
  const labels = norm.split(".");

  // Priority 1: site rules — check all specificity levels before moving on.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    const rule = index.siteRules.get(candidate);
    if (rule) return { kind: "site", rule };
  }

  // Priority 2: group rules — check all specificity levels.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    const group = index.groupRules.get(candidate);
    if (group) return { kind: "group", group };
  }

  // Priority 3: global block list.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    if (index.globalBlockDomains.has(candidate)) return { kind: "global-block" };
  }

  return null;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

let _cachedSettings: Settings | null = null;
let _cachedIndex: RuleIndex | null = null;

/**
 * Return the compiled index for `settings`, building it if needed.
 *
 * Uses reference equality on the settings object to detect staleness.
 * Because `getSettings()` creates a new object on every read (Zod parse),
 * the cache is naturally invalidated across separate settings loads. Within
 * a single settings load (same object reference), multiple policy calls
 * share one compiled index.
 *
 * The cache is also invalidated explicitly by `invalidateRuleIndex()`, which
 * storage.ts calls after writing new settings.
 */
export function getOrBuildIndex(settings: Settings): RuleIndex {
  if (_cachedIndex !== null && _cachedSettings === settings) {
    return _cachedIndex;
  }
  _cachedIndex = buildRuleIndex(settings);
  _cachedSettings = settings;
  return _cachedIndex;
}

/**
 * Discard the cached index.
 *
 * Call this after any settings mutation so the next lookup rebuilds from
 * fresh data. Also useful in tests to ensure a clean slate between cases.
 */
export function invalidateRuleIndex(): void {
  _cachedIndex = null;
  _cachedSettings = null;
}
