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

import type { Settings } from "./types";

// ─── Import diff ──────────────────────────────────────────────────────────────

export interface ProtectionDiff {
  /** True when the incoming settings reduce protection in any way. */
  reducesProtection: boolean;
  /** Human-readable list of individual reductions (shown in the gate). */
  reductions: string[];
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
  }

  // ── Groups ───────────────────────────────────────────────────────────────
  for (const group of current.groups) {
    if (!group.enabled) continue;

    const newGroup = incoming.groups.find((g) => g.id === group.id);

    if (!newGroup) {
      reductions.push(`Group "${group.name}" removed`);
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

    for (const domain of group.domains) {
      if (!newGroup.domains.includes(domain)) {
        reductions.push(`"${domain}" removed from group "${group.name}"`);
      }
    }
  }

  return { reducesProtection: reductions.length > 0, reductions };
}
