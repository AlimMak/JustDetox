import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBlockedState } from "../policy";
import { DEFAULT_SETTINGS } from "../types";
import type { Settings, UsageMap } from "../types";

afterEach(() => vi.useRealTimers());

function settings(overrides: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("live policy transitions", () => {
  it("ignores an expired group member and counts an overlapping member once", () => {
    const now = Date.now();
    const ruleSettings = settings({
      groups: [{
        id: "social", name: "Social", enabled: true, mode: "limit",
        limitMinutes: 30, domains: ["example.com", "m.example.com"],
      }],
    });
    const usage: UsageMap = {
      "example.com": {
        activeSeconds: 30 * 60,
        lastUpdated: now - 25 * 3_600_000,
        windowStartTs: now - 25 * 3_600_000,
      },
      "m.example.com": {
        activeSeconds: 10 * 60,
        lastUpdated: now,
        windowStartTs: now,
      },
    };

    const state = computeBlockedState("m.example.com", usage, ruleSettings);
    expect(state.blocked).toBe(false);
    expect(state.remainingSeconds).toBe(20 * 60);
  });

  it("reports when exhausted time becomes available", () => {
    const now = Date.now();
    const start = now - 23 * 3_600_000;
    const ruleSettings = settings({
      siteRules: [{ domain: "example.com", enabled: true, mode: "limit", limitMinutes: 10 }],
    });
    const usage: UsageMap = {
      "example.com": { activeSeconds: 10 * 60, lastUpdated: now, windowStartTs: start },
    };

    const state = computeBlockedState("example.com", usage, ruleSettings);
    expect(state).toMatchObject({
      blocked: true,
      source: "Site rule: example.com",
      nextCheckTs: start + 24 * 3_600_000,
      nextChangeLabel: "Time becomes available",
    });
  });

  it("reports the next start and end of a scheduled block", () => {
    vi.useFakeTimers();
    const today = new Date(2026, 8, 22, 10, 30);
    vi.setSystemTime(today);
    const ruleSettings = settings({
      siteRules: [{
        domain: "example.com", enabled: true, mode: "block",
        schedule: [{
          enabled: true,
          days: [today.getDay()],
          startMinutes: 11 * 60,
          endMinutes: 12 * 60,
        }],
      }],
    });

    const before = computeBlockedState("example.com", {}, ruleSettings);
    expect(before.blocked).toBe(false);
    expect(before.nextCheckTs).toBe(new Date(2026, 8, 22, 11, 0).getTime());

    vi.setSystemTime(new Date(2026, 8, 22, 11, 30));
    const during = computeBlockedState("example.com", {}, ruleSettings);
    expect(during.blocked).toBe(true);
    expect(during.nextCheckTs).toBe(new Date(2026, 8, 22, 12, 0).getTime());
    expect(during.nextChangeLabel).toBe("Schedule ends");
  });

  it("rechecks an allowed Locked In site when the session ends", () => {
    const now = Date.now();
    const ruleSettings = settings({
      siteRules: [{ domain: "example.com", enabled: true, mode: "block" }],
      lockedInSession: {
        active: true,
        startTs: now,
        endTs: now + 60_000,
        allowedDomains: ["example.com"],
      },
    });
    const state = computeBlockedState("example.com", {}, ruleSettings);
    expect(state.blocked).toBe(false);
    expect(state.nextCheckTs).toBe(now + 60_000);
  });
});
