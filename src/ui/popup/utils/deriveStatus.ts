/**
 * Pure helper that maps the output of computeBlockedState + policy resolution
 * into the SiteStatus shape consumed by the popup UI.
 *
 * Extracted from useSiteStatus so it can be unit-tested without a DOM.
 */

import type { BlockedState, EffectivePolicy } from "../../../core/policy";
import type { Settings, UsageMap } from "../../../core/types";
import { sumUsageUnder, normalizeHostname } from "../../../core/match";
import type { SiteMode, SiteStatus } from "../hooks/useSiteStatus";

export function deriveStatus(
  hostname: string,
  state: BlockedState,
  policy: EffectivePolicy | null,
  usage: UsageMap,
  settings: Settings,
): Omit<SiteStatus, "loading" | "error"> {
  // Map RuleMode → UI label
  let mode: SiteMode = "unrestricted";
  if (state.mode === "limit") {
    mode = "time-limited";
  } else if (state.mode === "block") {
    mode = "blocked";
  }

  // Aggregate usage for the relevant rule domain / group / hostname
  let activeSeconds = 0;
  if (policy?.reason === "site-rule" && policy.configuredDomain) {
    activeSeconds = sumUsageUnder(policy.configuredDomain, usage);
  } else if (policy?.reason === "group" && policy.groupId) {
    const group = settings.groups.find((g) => g.id === policy.groupId);
    if (group) {
      activeSeconds = group.domains.reduce((sum, d) => sum + sumUsageUnder(d, usage), 0);
    }
  } else {
    activeSeconds = usage[normalizeHostname(hostname)]?.activeSeconds ?? 0;
  }

  return {
    mode,
    blocked: state.blocked,
    remainingSeconds: state.remainingSeconds ?? null,
    activeSeconds,
  };
}
