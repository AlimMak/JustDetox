/**
 * JustDetox — Protected Settings Gate core logic.
 *
 * Provides `computeImportDiff` which compares an incoming settings backup
 * to the current settings and enumerates every reduction in protection.
 *
 * The actual gate UI is in src/ui/components/ProtectedGate.tsx.
 * The gate is invoked via the same `askFriction()` API as the Friction Layer,
 * but the `useFrictionGate` hook routes to the Protected Gate modal when
 * `settings.protectedGate.enabled` is true.
 */

import type { ScheduleWindow, Settings } from "./types";
import { resolveEffectivePolicy, type EffectivePolicy } from "./policy";
import { domainCovers, normalizeHostname } from "./match";

/** True when any minute protected by the old schedule becomes unprotected. */
export function hasReducedScheduleCoverage(
  current?: ScheduleWindow[],
  incoming?: ScheduleWindow[],
): boolean {
  const coverage = (windows?: ScheduleWindow[]): Uint8Array => {
    const minutes = new Uint8Array(7 * 1_440);
    if (!windows || windows.length === 0) {
      minutes.fill(1);
      return minutes;
    }
    for (const window of windows) {
      if (!window.enabled) continue;
      for (const day of window.days) {
        if (window.endMinutes > window.startMinutes) {
          minutes.fill(1, day * 1_440 + window.startMinutes, day * 1_440 + window.endMinutes);
        } else if (window.endMinutes < window.startMinutes) {
          minutes.fill(1, day * 1_440 + window.startMinutes, (day + 1) * 1_440);
          const nextDay = (day + 1) % 7;
          minutes.fill(1, nextDay * 1_440, nextDay * 1_440 + window.endMinutes);
        }
      }
    }
    return minutes;
  };

  const before = coverage(current);
  const after = coverage(incoming);
  return before.some((active, minute) => active === 1 && after[minute] === 0);
}

// ─── Import diff ──────────────────────────────────────────────────────────────

export interface ProtectionDiff {
  /** True when the incoming settings reduce protection in any way. */
  reducesProtection: boolean;
  /** Human-readable list of individual reductions (shown in the gate). */
  reductions: string[];
}

/** A new higher-priority rule can relax a rule without removing that rule. */
function effectivePolicyIsWeaker(before: EffectivePolicy, after: EffectivePolicy): boolean {
  if (before.mode === "block" && after.mode === "limit") return true;
  if (before.mode === "limit" && after.mode === "limit") {
    if ((after.limitSeconds ?? 0) > (before.limitSeconds ?? 0)) return true;
    if (before.delayEnabled && (!after.delayEnabled ||
      (after.delaySeconds ?? 0) < (before.delaySeconds ?? 0))) return true;
  }
  return hasReducedScheduleCoverage(before.schedule, after.schedule);
}

function policyIdentity(policy: EffectivePolicy): string {
  return `${policy.reason}:${policy.configuredDomain ?? ""}:${policy.groupId ?? ""}`;
}

/**
 * Compare `incoming` settings (from an import file) to `current` settings
 * and return every protection reduction.
 *
 * A "reduction" is any change that makes blocking weaker:
 *  - Extension being disabled
 *  - Domain removed from the always-blocked list
 *  - Site rule removed (when it was an enabled block/limit)
 *  - Site rule relaxed: block → limit, or limit increased
 *  - Group removed (when it was enabled)
 *  - Group relaxed: block → limit, limit increased, or domain removed
 *
 * Does NOT flag changes that increase protection (new rules, lower limits, etc.).
 */
export function computeImportDiff(current: Settings, incoming: Settings): ProtectionDiff {
  const reductions: string[] = [];

  // ── Extension master switch ──────────────────────────────────────────────
  if (!current.disabled && incoming.disabled) {
    reductions.push("Extension will be disabled");
  }

  if (!current.pauseWhenIdle && incoming.pauseWhenIdle) {
    reductions.push("Tracking will pause after five minutes without device input");
  }

  if (incoming.resetWindow.intervalHours < current.resetWindow.intervalHours) {
    reductions.push("Usage reset window shortened");
  }

  if (current.protectedGate.enabled && !incoming.protectedGate.enabled) {
    reductions.push("Protected Gate disabled");
  } else if (current.protectedGate.enabled && incoming.protectedGate.enabled && (
    (current.protectedGate.requireCooldown && !incoming.protectedGate.requireCooldown) ||
    (current.protectedGate.requirePhrase && !incoming.protectedGate.requirePhrase) ||
    incoming.protectedGate.cooldownSeconds < current.protectedGate.cooldownSeconds
  )) {
    reductions.push("Protected Gate weakened");
  }

  if (current.friction.enabled && !incoming.friction.enabled) {
    reductions.push("Friction Layer disabled");
  } else if (current.friction.enabled && current.friction.requireReflection &&
    !incoming.friction.requireReflection) {
    reductions.push("Friction reflection requirement removed");
  }

  if (current.globalDefaults?.mode === "block" && incoming.globalDefaults?.mode !== "block") {
    reductions.push("Default block rule weakened");
  } else if (current.globalDefaults?.mode === "limit" && (
    incoming.globalDefaults?.mode === undefined ||
    (incoming.globalDefaults.mode === "limit" &&
      (incoming.globalDefaults.limitMinutes ?? 0) > (current.globalDefaults.limitMinutes ?? 0))
  )) {
    reductions.push("Default time limit weakened");
  }

  if (current.lockedInSession?.active && Date.now() < current.lockedInSession.endTs) {
    if (!incoming.lockedInSession?.active || incoming.lockedInSession.endTs < current.lockedInSession.endTs ||
      incoming.lockedInSession.allowedDomains.some((domain) =>
        !current.lockedInSession!.allowedDomains.includes(domain))) {
      reductions.push("Active Locked In session weakened");
    }
  }

  if (current.allowlistMode.enabled && !incoming.allowlistMode.enabled) {
    reductions.push("Focus Environment disabled");
  } else if (current.allowlistMode.enabled && incoming.allowlistMode.enabled &&
    incoming.allowlistMode.allowedDomains.some((domain) => !current.allowlistMode.allowedDomains.includes(domain))) {
    reductions.push("Focus Environment allowlist expanded");
  } else if (!current.allowlistMode.enabled && incoming.allowlistMode.enabled) {
    const bypassesExistingRule = incoming.allowlistMode.allowedDomains.some((domain) =>
      resolveEffectivePolicy(domain, current) !== null ||
      Boolean(current.lockedInSession?.active && Date.now() < current.lockedInSession.endTs &&
        !current.lockedInSession.allowedDomains.some((allowed) =>
          domainCovers(normalizeHostname(domain), normalizeHostname(allowed)))));
    if (bypassesExistingRule) reductions.push("Focus Environment would bypass existing rules");
  }

  // ── Always-blocked list ──────────────────────────────────────────────────
  for (const domain of current.globalBlockList) {
    if (!incoming.globalBlockList.includes(domain)) {
      reductions.push(`"${domain}" removed from always-blocked list`);
    }
  }

  // ── Site rules ───────────────────────────────────────────────────────────
  for (const rule of current.siteRules) {
    if (!rule.enabled) continue; // already disabled — not a regression

    const newRule = incoming.siteRules.find((r) => r.domain === rule.domain);

    if (!newRule) {
      reductions.push(`Block rule for "${rule.domain}" removed`);
      continue;
    }

    if (!newRule.enabled) {
      reductions.push(`Rule for "${rule.domain}" disabled`);
      continue;
    }

    if (rule.mode === "block" && newRule.mode === "limit") {
      reductions.push(`"${rule.domain}" changed from block → time limit`);
    }

    if (
      rule.mode === "limit" &&
      newRule.mode === "limit" &&
      (newRule.limitMinutes ?? 0) > (rule.limitMinutes ?? 0)
    ) {
      reductions.push(
        `"${rule.domain}" limit increased from ${rule.limitMinutes ?? 0} min to ${newRule.limitMinutes ?? 0} min`,
      );
    }

    if (hasReducedScheduleCoverage(rule.schedule, newRule.schedule)) {
      reductions.push(`Schedule for "${rule.domain}" reduced`);
    }
    if (rule.delayEnabled && (!newRule.delayEnabled ||
      (newRule.delaySeconds ?? current.defaultDelaySeconds) < (rule.delaySeconds ?? current.defaultDelaySeconds))) {
      reductions.push(`Delay for "${rule.domain}" reduced`);
    }
  }

  // ── Groups ───────────────────────────────────────────────────────────────
  for (const group of current.groups) {
    if (!group.enabled) continue;

    const newGroup = incoming.groups.find((g) => g.id === group.id);

    if (!newGroup) {
      reductions.push(`Group "${group.name}" removed`);
      continue;
    }

    if (!newGroup.enabled) {
      reductions.push(`Group "${group.name}" disabled`);
      continue;
    }

    if (group.mode === "block" && newGroup.mode === "limit") {
      reductions.push(`Group "${group.name}" changed from block → time limit`);
    }

    if (
      group.mode === "limit" &&
      newGroup.mode === "limit" &&
      (newGroup.limitMinutes ?? 0) > (group.limitMinutes ?? 0)
    ) {
      reductions.push(
        `Group "${group.name}" limit increased from ${group.limitMinutes ?? 0} min to ${newGroup.limitMinutes ?? 0} min`,
      );
    }

    if (hasReducedScheduleCoverage(group.schedule, newGroup.schedule)) {
      reductions.push(`Schedule for group "${group.name}" reduced`);
    }
    if (group.delayEnabled && (!newGroup.delayEnabled ||
      (newGroup.delaySeconds ?? current.defaultDelaySeconds) < (group.delaySeconds ?? current.defaultDelaySeconds))) {
      reductions.push(`Delay for group "${group.name}" reduced`);
    }

    for (const domain of group.domains) {
      if (!newGroup.domains.includes(domain)) {
        reductions.push(`"${domain}" removed from group "${group.name}"`);
      }
    }
  }

  // Compare the rule that actually wins at each configured domain. Importing
  // a new site rule can override an unchanged group or always-blocked entry,
  // so checking only removed/edited entries would miss that reduction.
  const domains = new Set([
    ...current.siteRules.map((rule) => rule.domain),
    ...incoming.siteRules.map((rule) => rule.domain),
    ...current.groups.flatMap((group) => group.domains),
    ...incoming.groups.flatMap((group) => group.domains),
    ...current.globalBlockList,
    ...incoming.globalBlockList,
  ]);
  for (const domain of domains) {
    const before = resolveEffectivePolicy(domain, current);
    const after = resolveEffectivePolicy(domain, incoming);
    if (before && after && policyIdentity(before) !== policyIdentity(after) &&
      effectivePolicyIsWeaker(before, after)) {
      reductions.push(`Effective protection for "${domain}" weakened by a different rule`);
    }
  }

  return { reducesProtection: reductions.length > 0, reductions };
}
