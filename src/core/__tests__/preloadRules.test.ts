import { describe, expect, it } from "vitest";
import { buildPreloadRules, nextPreloadBoundary } from "../preloadRules";
import { DEFAULT_SETTINGS } from "../types";
import type { Settings } from "../types";

const now = new Date(2026, 8, 24, 12).getTime();
const blockedPage = "chrome-extension://test/blocked.html";
function settings(): Settings {
  return { ...structuredClone(DEFAULT_SETTINGS), preloadBlocking: true };
}

describe("pre-load rules", () => {
  it("stays off until enabled", () => {
    expect(buildPreloadRules(DEFAULT_SETTINGS, {}, now, blockedPage)).toEqual([]);
  });

  it("redirects a hard-blocked site and lets a more specific override through", () => {
    const config = settings();
    config.globalBlockList = ["example.com"];
    config.siteRules = [{ domain: "work.example.com", mode: "limit", limitMinutes: 60, enabled: true }];
    const rules = buildPreloadRules(config, {}, now, blockedPage);
    expect(rules.find((rule) => rule.condition.requestDomains?.includes("example.com"))?.action.type)
      .toBe("redirect");
    expect(rules[0].action.redirect?.regexSubstitution).toBe(`${blockedPage}?host=\\1`);
    const override = rules.find((rule) => rule.condition.requestDomains?.includes("work.example.com"));
    expect(override?.action.type).toBe("allow");
    expect(override!.priority).toBeGreaterThan(
      rules.find((rule) => rule.condition.requestDomains?.includes("example.com"))!.priority!,
    );
  });

  it("uses a catch-all rule with focus allowlist exceptions", () => {
    const config = settings();
    config.allowlistMode = { enabled: true, allowedDomains: ["work.example.com"] };
    const rules = buildPreloadRules(config, {}, now, blockedPage);
    expect(rules[0].condition.regexFilter).toBe("^https?://([^/?#:]+).*");
    expect(rules[0].action.type).toBe("redirect");
    expect(rules.find((rule) => rule.condition.requestDomains?.includes("work.example.com"))?.action.type)
      .toBe("allow");
  });

  it("redirects an exhausted time limit", () => {
    const config = settings();
    config.siteRules = [{ domain: "example.com", mode: "limit", limitMinutes: 1, enabled: true }];
    const rules = buildPreloadRules(config, {
      "example.com": { activeSeconds: 60, lastUpdated: now, windowStartTs: now - 60_000 },
    }, now, blockedPage);
    expect(rules.find((rule) => rule.condition.requestDomains?.includes("example.com"))?.action.type)
      .toBe("redirect");
  });

  it("refreshes at the next scheduled protection change", () => {
    const config = settings();
    const date = new Date(now);
    config.siteRules = [{ domain: "example.com", mode: "block", enabled: true,
      schedule: [{ enabled: true, days: [date.getDay()],
        startMinutes: 12 * 60 + 1, endMinutes: 13 * 60 }] }];
    expect(buildPreloadRules(config, {}, now, blockedPage)).toEqual([]);
    expect(nextPreloadBoundary(config, {}, now)).toBe(new Date(2026, 8, 24, 12, 1).getTime());
  });
});
