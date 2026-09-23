import type { ScheduleWindow, Settings, SiteGroup, SiteRule } from "../../../core/types";
import { resolveEffectivePolicy, type EffectivePolicy } from "../../../core/policy";

/** Whether a schedule protects a particular minute of the week. */
function coversMinute(schedules: ScheduleWindow[] | undefined, day: number, minute: number): boolean {
  if (!schedules?.length) return true;
  return schedules.some((window) => {
    if (!window.enabled || !window.days.length || window.startMinutes === window.endMinutes) return false;
    if (window.endMinutes > window.startMinutes) {
      return window.days.includes(day) && minute >= window.startMinutes && minute < window.endMinutes;
    }
    return (window.days.includes(day) && minute >= window.startMinutes) ||
      (window.days.includes((day + 6) % 7) && minute < window.endMinutes);
  });
}

/** True if editing a schedule opens access during any previously protected minute. */
export function reducesScheduleCoverage(
  before: ScheduleWindow[] | undefined,
  after: ScheduleWindow[] | undefined,
): boolean {
  if (!before?.length) return after?.length ? !coversWholeWeek(after) : false;
  if (!after?.length) return false;
  for (let day = 0; day < 7; day++) {
    for (let minute = 0; minute < 1440; minute++) {
      if (coversMinute(before, day, minute) && !coversMinute(after, day, minute)) return true;
    }
  }
  return false;
}

function coversWholeWeek(schedules: ScheduleWindow[]): boolean {
  for (let day = 0; day < 7; day++) {
    for (let minute = 0; minute < 1440; minute++) {
      if (!coversMinute(schedules, day, minute)) return false;
    }
  }
  return true;
}

function commonWeakeningReasons(
  before: SiteRule | SiteGroup,
  after: SiteRule | SiteGroup,
  defaultDelaySeconds: number,
): string[] {
  if (!before.enabled) return [];
  const reasons: string[] = [];
  if (!after.enabled) reasons.push("Turn off the rule");
  if (before.mode === "block" && after.mode === "limit") {
    reasons.push("Change a block to a time limit");
  }
  if (before.mode === "limit" && after.mode === "limit") {
    if ((after.limitMinutes ?? 0) > (before.limitMinutes ?? 0)) {
      reasons.push(`Increase the limit from ${before.limitMinutes ?? 0} to ${after.limitMinutes ?? 0} minutes`);
    }
    if (before.delayEnabled && !after.delayEnabled) {
      reasons.push("Turn off Delay Mode");
    } else if (before.delayEnabled && after.delayEnabled &&
      (after.delaySeconds ?? defaultDelaySeconds) < (before.delaySeconds ?? defaultDelaySeconds)) {
      reasons.push("Shorten the delay");
    }
  }
  if (reducesScheduleCoverage(before.schedule, after.schedule)) {
    reasons.push("Reduce scheduled protection");
  }
  return reasons;
}

export function siteWeakeningReasons(before: SiteRule, after: SiteRule, defaultDelaySeconds = 15): string[] {
  return commonWeakeningReasons(before, after, defaultDelaySeconds);
}

export function groupWeakeningReasons(before: SiteGroup, after: SiteGroup, defaultDelaySeconds = 15): string[] {
  const reasons = commonWeakeningReasons(before, after, defaultDelaySeconds);
  if (before.enabled) {
    const removed = before.domains.filter((domain) => !after.domains.includes(domain));
    if (removed.length) reasons.push(`Remove ${removed.join(", ")} from the group`);
  }
  return reasons;
}

function policyWeakeningReasons(before: EffectivePolicy | null, after: EffectivePolicy | null): string[] {
  if (!before || !after) return [];
  const reasons: string[] = [];
  if (before.mode === "block" && after.mode === "limit") {
    reasons.push("Override an existing block with a time limit");
  } else if (before.mode === "limit" && after.mode === "limit" &&
    (after.limitSeconds ?? 0) > (before.limitSeconds ?? 0)) {
    reasons.push("Override an existing rule with a longer time limit");
  }
  if (reducesScheduleCoverage(before.schedule, after.schedule)) {
    reasons.push("Allow access outside an existing protected schedule");
  }
  if (before.mode === "limit" && after.mode === "limit" && before.delayEnabled &&
    (!after.delayEnabled || (after.delaySeconds ?? 0) < (before.delaySeconds ?? 0))) {
    reasons.push("Reduce an existing delay");
  }
  return reasons;
}

/** New higher-priority rules can override an existing group or global block. */
export function newSiteWeakeningReasons(rule: SiteRule, settings: Settings): string[] {
  if (!rule.enabled) return [];
  const before = resolveEffectivePolicy(rule.domain, settings);
  const after = resolveEffectivePolicy(rule.domain, {
    ...settings,
    siteRules: [...settings.siteRules, rule],
  });
  return policyWeakeningReasons(before, after);
}

export function newGroupWeakeningReasons(group: SiteGroup, settings: Settings): string[] {
  if (!group.enabled) return [];
  const proposed = { ...settings, groups: [...settings.groups, group] };
  return group.domains.flatMap((domain) => policyWeakeningReasons(
    resolveEffectivePolicy(domain, settings),
    resolveEffectivePolicy(domain, proposed),
  ).map((reason) => `${domain}: ${reason}`));
}
