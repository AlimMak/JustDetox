import { expect, it } from "vitest";
import { limitedUsageMinutes } from "../dopamine";
import { DEFAULT_SETTINGS } from "../types";

it("counts time under overlapping group and site limits only once", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    siteRules: [{ domain: "example.com", mode: "limit" as const, limitMinutes: 60, enabled: true }],
    groups: [{ id: "g", name: "Group", domains: ["example.com"], mode: "limit" as const, limitMinutes: 60, enabled: true }],
  };
  const usage = {
    "example.com": { activeSeconds: 600, lastUpdated: 1, windowStartTs: 1 },
  };
  expect(limitedUsageMinutes(settings, usage)).toBe(10);
});
