import { describe, expect, it } from "vitest";
import type { ScheduleWindow, SiteGroup, SiteRule } from "../../../core/types";
import { DEFAULT_SETTINGS } from "../../../core/types";
import { groupWeakeningReasons, newGroupWeakeningReasons, newSiteWeakeningReasons, reducesScheduleCoverage, siteWeakeningReasons } from "../utils/protection";

const weekdays: ScheduleWindow = {
  enabled: true,
  days: [1, 2, 3, 4, 5],
  startMinutes: 9 * 60,
  endMinutes: 17 * 60,
};

const site: SiteRule = {
  domain: "example.com",
  mode: "limit",
  limitMinutes: 30,
  enabled: true,
  delayEnabled: true,
  delaySeconds: 20,
  schedule: [weekdays],
};

describe("schedule coverage changes", () => {
  it("detects a shorter scheduled period", () => {
    expect(reducesScheduleCoverage([weekdays], [{ ...weekdays, endMinutes: 16 * 60 }])).toBe(true);
  });

  it("detects reduced coverage across midnight", () => {
    const overnight = { ...weekdays, days: [1], startMinutes: 22 * 60, endMinutes: 2 * 60 };
    expect(reducesScheduleCoverage([overnight], [{ ...overnight, endMinutes: 60 }])).toBe(true);
    expect(reducesScheduleCoverage([overnight], [{ ...overnight, endMinutes: 3 * 60 }])).toBe(false);
  });

  it("recognizes removing a schedule as stronger protection", () => {
    expect(reducesScheduleCoverage([weekdays], undefined)).toBe(false);
    expect(reducesScheduleCoverage(undefined, [weekdays])).toBe(true);
  });
});

describe("rule weakening", () => {
  it("includes disabling, longer limits, shorter delays, and schedule reductions", () => {
    const reasons = siteWeakeningReasons(site, {
      ...site,
      enabled: false,
      limitMinutes: 45,
      delaySeconds: 10,
      schedule: [{ ...weekdays, days: [1, 2] }],
    });
    expect(reasons).toHaveLength(4);
  });

  it("does not gate edits to an already disabled rule", () => {
    expect(siteWeakeningReasons({ ...site, enabled: false }, { ...site, limitMinutes: 45 })).toEqual([]);
  });

  it("uses the configured default when an old delay had no explicit duration", () => {
    expect(siteWeakeningReasons(
      { ...site, delaySeconds: undefined },
      { ...site, delaySeconds: 10 },
      20,
    )).toContain("Shorten the delay");
  });

  it("finds removed group domains", () => {
    const group: SiteGroup = { ...site, id: "group", name: "Group", domains: ["example.com", "another.com"] };
    expect(groupWeakeningReasons(group, { ...group, domains: ["another.com"] }))
      .toContain("Remove example.com from the group");
  });

  it("gates a new site limit that overrides a group block", () => {
    const group: SiteGroup = { id: "blocked", name: "Blocked", domains: ["example.com"], mode: "block", enabled: true };
    const reasons = newSiteWeakeningReasons(site, { ...DEFAULT_SETTINGS, groups: [group] });
    expect(reasons).toContain("Override an existing block with a time limit");
  });

  it("gates a new group limit that overrides the always-blocked list", () => {
    const group: SiteGroup = { id: "new", name: "New", domains: ["example.com"], mode: "limit", limitMinutes: 30, enabled: true };
    const reasons = newGroupWeakeningReasons(group, { ...DEFAULT_SETTINGS, globalBlockList: ["example.com"] });
    expect(reasons).toContain("example.com: Override an existing block with a time limit");
  });
});
