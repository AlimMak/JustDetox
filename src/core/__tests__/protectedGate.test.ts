import { describe, expect, it } from "vitest";
import { computeImportDiff, hasReducedScheduleCoverage } from "../protectedGate";
import { DEFAULT_SETTINGS } from "../types";
import type { Settings } from "../types";

function settings(): Settings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("schedule protection comparison", () => {
  const weekdays = [{ enabled: true, days: [1, 2, 3, 4, 5], startMinutes: 9 * 60, endMinutes: 17 * 60 }];

  it("detects removed protected hours", () => {
    expect(hasReducedScheduleCoverage(weekdays, [{ ...weekdays[0], endMinutes: 16 * 60 }])).toBe(true);
  });

  it("does not flag expanded protected hours", () => {
    expect(hasReducedScheduleCoverage(weekdays, [{ ...weekdays[0], endMinutes: 18 * 60 }])).toBe(false);
  });

  it("handles overnight windows across the week boundary", () => {
    const sundayNight = [{ enabled: true, days: [0], startMinutes: 22 * 60, endMinutes: 2 * 60 }];
    const sundayOnly = [{ enabled: true, days: [0], startMinutes: 22 * 60, endMinutes: 23 * 60 }];
    expect(hasReducedScheduleCoverage(sundayNight, sundayOnly)).toBe(true);
  });
});

describe("import protection diff", () => {
  it("flags disabling an existing site or group", () => {
    const before = settings();
    before.siteRules = [{ domain: "example.com", mode: "block", enabled: true }];
    before.groups = [{ id: "g", name: "Group", domains: ["social.example"], mode: "block", enabled: true }];
    const after = structuredClone(before);
    after.siteRules[0].enabled = false;
    after.groups[0].enabled = false;
    const diff = computeImportDiff(before, after);
    expect(diff.reductions).toContain('Rule for "example.com" disabled');
    expect(diff.reductions).toContain('Group "Group" disabled');
  });

  it("flags shorter reset windows and weaker gates", () => {
    const before = settings();
    const after = settings();
    after.resetWindow.intervalHours = 6;
    after.protectedGate.enabled = false;
    expect(computeImportDiff(before, after).reducesProtection).toBe(true);
    expect(computeImportDiff(before, after).reductions).toContain("Protected Gate disabled");
  });

  it("flags a focus allowlist that bypasses an existing block", () => {
    const before = settings();
    before.siteRules = [{ domain: "example.com", mode: "block", enabled: true }];
    const after = structuredClone(before);
    after.allowlistMode = { enabled: true, allowedDomains: ["example.com"] };
    expect(computeImportDiff(before, after).reductions)
      .toContain("Focus Environment would bypass existing rules");
  });

  it("gates an imported site rule that overrides an unchanged always-blocked entry", () => {
    const before = settings();
    before.globalBlockList = ["example.com"];
    const after = structuredClone(before);
    after.siteRules = [{ domain: "example.com", mode: "limit", enabled: true, limitMinutes: 60 }];
    expect(computeImportDiff(before, after).reductions)
      .toContain('Effective protection for "example.com" weakened by a different rule');
  });

  it("gates a new scheduled override of an existing group block", () => {
    const before = settings();
    before.groups = [{ id: "g", name: "Group", domains: ["example.com"], mode: "block", enabled: true }];
    const after = structuredClone(before);
    after.siteRules = [{
      domain: "example.com", mode: "block", enabled: true,
      schedule: [{ enabled: true, days: [1], startMinutes: 9 * 60, endMinutes: 17 * 60 }],
    }];
    expect(computeImportDiff(before, after).reducesProtection).toBe(true);
  });
});
