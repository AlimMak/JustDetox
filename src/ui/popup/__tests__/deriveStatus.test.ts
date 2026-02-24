import { describe, it, expect } from "vitest";
import { deriveStatus } from "../utils/deriveStatus";
import type { BlockedState } from "../../../core/policy";
import type { Settings, UsageMap } from "../../../core/types";
import { DEFAULT_SETTINGS } from "../../../core/types";

const baseSettings: Settings = { ...DEFAULT_SETTINGS };
const emptyUsage: UsageMap = {};

function makeUsage(domain: string, activeSeconds: number): UsageMap {
  return { [domain]: { activeSeconds, lastUpdated: Date.now(), windowStartTs: Date.now() } };
}

describe("deriveStatus — mode mapping", () => {
  it("maps mode:block to 'blocked'", () => {
    const state: BlockedState = { blocked: true, mode: "block", message: "blocked" };
    const result = deriveStatus("example.com", state, null, emptyUsage, baseSettings);
    expect(result.mode).toBe("blocked");
    expect(result.blocked).toBe(true);
  });

  it("maps mode:limit (exhausted) to 'time-limited'", () => {
    const state: BlockedState = { blocked: true, mode: "limit", remainingSeconds: 0 };
    const result = deriveStatus("youtube.com", state, null, emptyUsage, baseSettings);
    expect(result.mode).toBe("time-limited");
    expect(result.blocked).toBe(true);
    expect(result.remainingSeconds).toBe(0);
  });

  it("maps mode:limit (has remaining) to 'time-limited'", () => {
    const state: BlockedState = { blocked: false, mode: "limit", remainingSeconds: 300 };
    const result = deriveStatus("youtube.com", state, null, emptyUsage, baseSettings);
    expect(result.mode).toBe("time-limited");
    expect(result.blocked).toBe(false);
    expect(result.remainingSeconds).toBe(300);
  });

  it("maps no mode to 'unrestricted'", () => {
    const state: BlockedState = { blocked: false };
    const result = deriveStatus("example.com", state, null, emptyUsage, baseSettings);
    expect(result.mode).toBe("unrestricted");
    expect(result.blocked).toBe(false);
    expect(result.remainingSeconds).toBeNull();
  });
});

describe("deriveStatus — activeSeconds resolution", () => {
  it("falls back to exact hostname usage when no policy", () => {
    const usage = makeUsage("example.com", 600);
    const state: BlockedState = { blocked: false };
    const result = deriveStatus("example.com", state, null, usage, baseSettings);
    expect(result.activeSeconds).toBe(600);
  });

  it("returns 0 when hostname has no usage record", () => {
    const state: BlockedState = { blocked: false };
    const result = deriveStatus("new-site.com", state, null, emptyUsage, baseSettings);
    expect(result.activeSeconds).toBe(0);
  });

  it("aggregates subdomain usage for site-rule policy", () => {
    // Rule configured for "twitter.com" — usage recorded under subdomain
    const usage: UsageMap = {
      "twitter.com": { activeSeconds: 120, lastUpdated: 0, windowStartTs: 0 },
      "m.twitter.com": { activeSeconds: 80, lastUpdated: 0, windowStartTs: 0 },
    };
    const state: BlockedState = { blocked: false, mode: "limit", remainingSeconds: 100 };
    const policy = { mode: "limit" as const, reason: "site-rule" as const, configuredDomain: "twitter.com" };
    const result = deriveStatus("m.twitter.com", state, policy, usage, baseSettings);
    expect(result.activeSeconds).toBe(200); // 120 + 80 summed under twitter.com
  });

  it("aggregates group usage across all group domains", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      groups: [{
        id: "g1",
        name: "Social",
        domains: ["twitter.com", "instagram.com"],
        mode: "limit",
        limitMinutes: 30,
        enabled: true,
      }],
    };
    const usage: UsageMap = {
      "twitter.com": { activeSeconds: 300, lastUpdated: 0, windowStartTs: 0 },
      "m.instagram.com": { activeSeconds: 200, lastUpdated: 0, windowStartTs: 0 },
    };
    const state: BlockedState = { blocked: false, mode: "limit", remainingSeconds: 300 };
    const policy = { mode: "limit" as const, reason: "group" as const, groupId: "g1" };
    const result = deriveStatus("twitter.com", state, policy, usage, settings);
    expect(result.activeSeconds).toBe(500); // 300 + 200 across group
  });
});
