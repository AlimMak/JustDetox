/**
 * JustDetox — Rule evaluation and blocked-state computation.
 *
 * Two public entry points:
 *
 *   resolveEffectivePolicy(hostname, settings)
 *     → The applicable rule for this domain (or null if unrestricted).
 *       Pure function of settings only — no usage data needed.
 *
 *   computeBlockedState(hostname, usage, settings)
 *     → Whether the domain is currently blocked, the reason message,
 *       and how many seconds remain (for limit-mode rules).
 *       Pure function of settings + current usage snapshot.
 *
 * Both functions are free of Chrome extension APIs and safe to call
 * from service worker, content scripts, and UI alike.
 */

import type { Settings, UsageMap, RuleMode } from "./types";
import { normalizeHostname, domainCovers, matchesAny, sumUsageUnder } from "./match";

// ─── Block messages ───────────────────────────────────────────────────────────

/** Shown when the domain is permanently blocked. */
export const MSG_HARD_BLOCK = "not right now, lock back in";

/** Shown when the time limit for the current window has been exhausted. */
export const MSG_TIME_UP = "no more, lock back in";

/** Shown when a domain is accessed outside the active Locked In session's allowed list. */
export const MSG_LOCKED_IN = "Not part of your session. Stay locked in.";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PolicyReason = "site-rule" | "group" | "global-block-list" | "global-defaults";

/**
 * The effective rule that applies to a domain, resolved from settings.
 *
 * Carries enough context (configuredDomain, groupId) for computeBlockedState
 * to look up the correct usage bucket(s) without re-scanning rules.
 */
export interface EffectivePolicy {
  mode: RuleMode;
  /** Seconds allowed per reset window. Required when mode === "limit". */
  limitSeconds?: number;
  reason: PolicyReason;
  /**
   * The exact domain string from the matching SiteRule.
   * Set when reason === "site-rule" so usage is summed for the configured
   * domain (and all its subdomains) rather than only the visited hostname.
   */
  configuredDomain?: string;
  /** The group.id when reason === "group". */
  groupId?: string;
}

export interface BlockedState {
  blocked: boolean;
  /** Human-readable message; set only when blocked === true. */
  message?: string;
  mode?: RuleMode;
  /** Seconds remaining in the current window; set only for limit-mode rules. */
  remainingSeconds?: number;
  /** True when the block was caused by Locked In Mode (domain not in session allow-list). */
  lockedIn?: boolean;
}

// ─── resolveEffectivePolicy ───────────────────────────────────────────────────

/**
 * Resolve the effective policy for `hostname` from `settings`.
 *
 * Precedence (first match wins):
 *  1. Per-site SiteRule — highest priority; an enabled rule for this domain
 *     overrides any group or global rule.
 *  2. SiteGroup — the first enabled group whose domain list covers this hostname.
 *  3. globalBlockList — quick-add list of always-blocked domains.
 *  4. globalDefaults — catch-all fallback.
 *
 * Returns `null` when no rule applies (the domain is unrestricted).
 */
export function resolveEffectivePolicy(
  hostname: string,
  settings: Settings,
): EffectivePolicy | null {
  const host = normalizeHostname(hostname);

  // 1. Per-site rules
  for (const rule of settings.siteRules) {
    if (!rule.enabled) continue;
    if (!domainCovers(host, normalizeHostname(rule.domain))) continue;

    return {
      mode: rule.mode,
      limitSeconds: rule.mode === "limit" ? (rule.limitMinutes ?? 0) * 60 : undefined,
      reason: "site-rule",
      configuredDomain: rule.domain,
    };
  }

  // 2. Group rules
  for (const group of settings.groups) {
    if (!group.enabled) continue;
    if (!matchesAny(host, group.domains)) continue;

    return {
      mode: group.mode,
      limitSeconds: group.mode === "limit" ? (group.limitMinutes ?? 0) * 60 : undefined,
      reason: "group",
      groupId: group.id,
    };
  }

  // 3. Global block list
  if (matchesAny(host, settings.globalBlockList)) {
    return { mode: "block", reason: "global-block-list" };
  }

  // 4. Global defaults
  if (settings.globalDefaults?.mode) {
    const { mode, limitMinutes } = settings.globalDefaults;
    return {
      mode,
      limitSeconds: mode === "limit" ? (limitMinutes ?? 0) * 60 : undefined,
      reason: "global-defaults",
    };
  }

  return null;
}

// ─── computeBlockedState ──────────────────────────────────────────────────────

/**
 * Compute whether `hostname` is currently blocked, given the live usage snapshot.
 *
 * Returns:
 *  - `{ blocked: false }` — no restriction, or within the time limit.
 *  - `{ blocked: true, message: MSG_HARD_BLOCK }` — hard-blocked site.
 *  - `{ blocked: true, message: MSG_TIME_UP }` — time limit exhausted.
 *
 * For group rules with mode === "limit", usage is summed across all domains
 * in the group (shared pool) including their subdomains.
 *
 * For site-rule with mode === "limit", usage is summed for the configured
 * domain and all its subdomains (e.g. tracking both "twitter.com" and
 * "m.twitter.com" against a single rule for "twitter.com").
 */
export function computeBlockedState(
  hostname: string,
  usage: UsageMap,
  settings: Settings,
): BlockedState {
  // ── Locked In Mode: evaluated before all other rules ──────────────────────
  const session = settings.lockedInSession;
  if (session?.active && Date.now() < session.endTs) {
    const host = normalizeHostname(hostname);
    const isAllowed = session.allowedDomains.some((d) =>
      domainCovers(host, normalizeHostname(d)),
    );

    if (!isAllowed) {
      // Domain is not in the session's allowed list — block unconditionally.
      return { blocked: true, message: MSG_LOCKED_IN, mode: "block", lockedIn: true };
    }

    // Domain is in the allowed list — grant access, bypassing all other rules.
    // Time tracking still accumulates normally via the tracker.
    return { blocked: false };
  }

  const policy = resolveEffectivePolicy(hostname, settings);
  if (!policy) return { blocked: false };

  if (policy.mode === "block") {
    return { blocked: true, message: MSG_HARD_BLOCK, mode: "block" };
  }

  // mode === "limit"
  const limitSeconds = policy.limitSeconds ?? 0;
  const usedSeconds = resolveUsedSeconds(hostname, usage, policy, settings);
  const remaining = Math.max(0, limitSeconds - usedSeconds);

  if (remaining <= 0) {
    return { blocked: true, message: MSG_TIME_UP, mode: "limit", remainingSeconds: 0 };
  }

  return { blocked: false, mode: "limit", remainingSeconds: remaining };
}

// ─── Internal: usage resolution ──────────────────────────────────────────────

/**
 * Resolve the seconds-used for `hostname` under the given policy.
 *
 * - site-rule: sum all usage keys that fall under the configured domain.
 * - group:     sum all usage keys that fall under any domain in the group.
 * - global-defaults: look up the exact hostname only (each domain is independent).
 */
function resolveUsedSeconds(
  hostname: string,
  usage: UsageMap,
  policy: EffectivePolicy,
  settings: Settings,
): number {
  if (policy.reason === "site-rule" && policy.configuredDomain) {
    return sumUsageUnder(policy.configuredDomain, usage);
  }

  if (policy.reason === "group" && policy.groupId) {
    const group = settings.groups.find((g) => g.id === policy.groupId);
    if (group) {
      return group.domains.reduce((sum, d) => sum + sumUsageUnder(d, usage), 0);
    }
  }

  // global-defaults (and any unexpected reason): per-hostname only
  return usage[normalizeHostname(hostname)]?.activeSeconds ?? 0;
}
