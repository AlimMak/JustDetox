import { describe, it, expect } from "vitest";
import {
  resolveEffectivePolicy,
  computeBlockedState,
  MSG_HARD_BLOCK,
  MSG_TIME_UP,
} from "../policy";
import type { Settings, UsageMap } from "../types";
import { DEFAULT_SETTINGS } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function makeUsage(map: Record<string, number> = {}): UsageMap {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(map).map(([domain, secs]) => [
      domain,
      { activeSeconds: secs, lastUpdated: now, windowStartTs: now },
    ]),
  );
}

// ─── resolveEffectivePolicy ───────────────────────────────────────────────────

describe("resolveEffectivePolicy", () => {
  describe("no rules", () => {
    it("returns null when settings are all empty", () => {
      expect(resolveEffectivePolicy("youtube.com", makeSettings())).toBeNull();
    });
  });

  describe("site-rule precedence", () => {
    it("returns the site-rule when the hostname matches exactly", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "youtube.com", mode: "block", enabled: true }],
      });
      const policy = resolveEffectivePolicy("youtube.com", settings);
      expect(policy).toMatchObject({ mode: "block", reason: "site-rule" });
    });

    it("matches a subdomain against the site-rule", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "youtube.com", mode: "block", enabled: true }],
      });
      const policy = resolveEffectivePolicy("m.youtube.com", settings);
      expect(policy).toMatchObject({ mode: "block", reason: "site-rule" });
    });

    it("stores the configured domain on the policy for usage lookups", () => {
      const settings = makeSettings({
        siteRules: [
          { domain: "twitter.com", mode: "limit", limitMinutes: 30, enabled: true },
        ],
      });
      const policy = resolveEffectivePolicy("www.twitter.com", settings);
      expect(policy?.configuredDomain).toBe("twitter.com");
    });

    it("skips disabled site-rules", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "youtube.com", mode: "block", enabled: false }],
      });
      expect(resolveEffectivePolicy("youtube.com", settings)).toBeNull();
    });

    it("site-rule wins over a matching group", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "twitter.com", mode: "block", enabled: true }],
        groups: [
          {
            id: "social",
            name: "Social",
            domains: ["twitter.com"],
            mode: "limit",
            limitMinutes: 60,
            enabled: true,
          },
        ],
      });
      const policy = resolveEffectivePolicy("twitter.com", settings);
      expect(policy?.reason).toBe("site-rule");
      expect(policy?.mode).toBe("block");
    });

    it("falls through to group when site-rule is disabled", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "twitter.com", mode: "block", enabled: false }],
        groups: [
          {
            id: "social",
            name: "Social",
            domains: ["twitter.com"],
            mode: "limit",
            limitMinutes: 60,
            enabled: true,
          },
        ],
      });
      const policy = resolveEffectivePolicy("twitter.com", settings);
      expect(policy?.reason).toBe("group");
    });
  });

  describe("group rules", () => {
    it("matches a domain inside a group", () => {
      const settings = makeSettings({
        groups: [
          {
            id: "g1",
            name: "Social",
            domains: ["facebook.com", "instagram.com"],
            mode: "block",
            enabled: true,
          },
        ],
      });
      const policy = resolveEffectivePolicy("instagram.com", settings);
      expect(policy).toMatchObject({ mode: "block", reason: "group", groupId: "g1" });
    });

    it("matches a subdomain of a domain inside a group", () => {
      const settings = makeSettings({
        groups: [
          {
            id: "g1",
            name: "Social",
            domains: ["facebook.com"],
            mode: "block",
            enabled: true,
          },
        ],
      });
      const policy = resolveEffectivePolicy("m.facebook.com", settings);
      expect(policy?.reason).toBe("group");
    });

    it("skips disabled groups", () => {
      const settings = makeSettings({
        groups: [
          {
            id: "g1",
            name: "Social",
            domains: ["facebook.com"],
            mode: "block",
            enabled: false,
          },
        ],
      });
      expect(resolveEffectivePolicy("facebook.com", settings)).toBeNull();
    });

    it("computes limitSeconds correctly for a limit-mode group", () => {
      const settings = makeSettings({
        groups: [
          {
            id: "g1",
            name: "Social",
            domains: ["twitter.com"],
            mode: "limit",
            limitMinutes: 45,
            enabled: true,
          },
        ],
      });
      const policy = resolveEffectivePolicy("twitter.com", settings);
      expect(policy?.limitSeconds).toBe(45 * 60);
    });
  });

  describe("global block list", () => {
    it("matches a domain in globalBlockList", () => {
      const settings = makeSettings({ globalBlockList: ["reddit.com"] });
      const policy = resolveEffectivePolicy("reddit.com", settings);
      expect(policy).toMatchObject({ mode: "block", reason: "global-block-list" });
    });

    it("matches a subdomain via globalBlockList", () => {
      const settings = makeSettings({ globalBlockList: ["reddit.com"] });
      const policy = resolveEffectivePolicy("old.reddit.com", settings);
      expect(policy?.reason).toBe("global-block-list");
    });

    it("site-rule wins over globalBlockList", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "reddit.com", mode: "limit", limitMinutes: 10, enabled: true }],
        globalBlockList: ["reddit.com"],
      });
      const policy = resolveEffectivePolicy("reddit.com", settings);
      expect(policy?.reason).toBe("site-rule");
    });
  });

  describe("global defaults", () => {
    it("applies globalDefaults when no other rule matches", () => {
      const settings = makeSettings({
        globalDefaults: { mode: "block" },
      });
      const policy = resolveEffectivePolicy("anything.com", settings);
      expect(policy).toMatchObject({ mode: "block", reason: "global-defaults" });
    });

    it("computes limitSeconds for globalDefaults with mode=limit", () => {
      const settings = makeSettings({
        globalDefaults: { mode: "limit", limitMinutes: 20 },
      });
      const policy = resolveEffectivePolicy("anything.com", settings);
      expect(policy?.limitSeconds).toBe(20 * 60);
    });

    it("site-rule still wins over globalDefaults", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "github.com", mode: "limit", limitMinutes: 0, enabled: true }],
        globalDefaults: { mode: "block" },
      });
      const policy = resolveEffectivePolicy("github.com", settings);
      expect(policy?.reason).toBe("site-rule");
    });
  });

  describe("case insensitivity", () => {
    it("normalizes hostname before matching site-rule", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "YouTube.com", mode: "block", enabled: true }],
      });
      expect(resolveEffectivePolicy("YOUTUBE.COM", settings)).not.toBeNull();
    });

    it("normalizes hostname before matching group domains", () => {
      const settings = makeSettings({
        groups: [
          {
            id: "g1",
            name: "Video",
            domains: ["YOUTUBE.COM"],
            mode: "block",
            enabled: true,
          },
        ],
      });
      expect(resolveEffectivePolicy("youtube.com", settings)).not.toBeNull();
    });
  });
});

// ─── computeBlockedState ──────────────────────────────────────────────────────

describe("computeBlockedState", () => {
  describe("no matching rule", () => {
    it("returns not-blocked when no rule applies", () => {
      const state = computeBlockedState("github.com", makeUsage(), makeSettings());
      expect(state.blocked).toBe(false);
      expect(state.message).toBeUndefined();
    });
  });

  describe("block mode", () => {
    it("always returns blocked with hard-block message", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "youtube.com", mode: "block", enabled: true }],
      });
      const state = computeBlockedState("youtube.com", makeUsage(), settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_HARD_BLOCK);
      expect(state.mode).toBe("block");
    });

    it("blocks a subdomain with the same hard-block message", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "youtube.com", mode: "block", enabled: true }],
      });
      const state = computeBlockedState("m.youtube.com", makeUsage(), settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_HARD_BLOCK);
    });
  });

  describe("limit mode — per-site rule", () => {
    const settings = makeSettings({
      siteRules: [
        { domain: "twitter.com", mode: "limit", limitMinutes: 30, enabled: true },
      ],
    });
    const limitSeconds = 30 * 60; // 1800

    it("is not blocked when usage is zero", () => {
      const state = computeBlockedState("twitter.com", makeUsage(), settings);
      expect(state.blocked).toBe(false);
      expect(state.remainingSeconds).toBe(limitSeconds);
    });

    it("is not blocked when usage is under the limit", () => {
      const usage = makeUsage({ "twitter.com": 600 }); // 10 min used
      const state = computeBlockedState("twitter.com", usage, settings);
      expect(state.blocked).toBe(false);
      expect(state.remainingSeconds).toBe(limitSeconds - 600);
    });

    it("is blocked exactly when usage equals the limit", () => {
      const usage = makeUsage({ "twitter.com": limitSeconds });
      const state = computeBlockedState("twitter.com", usage, settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_TIME_UP);
      expect(state.remainingSeconds).toBe(0);
    });

    it("is blocked when usage exceeds the limit", () => {
      const usage = makeUsage({ "twitter.com": limitSeconds + 500 });
      const state = computeBlockedState("twitter.com", usage, settings);
      expect(state.blocked).toBe(true);
      expect(state.remainingSeconds).toBe(0);
    });

    it("sums subdomain usage against the same site-rule limit", () => {
      // Rule is for "twitter.com". Usage is split across the root and www subdomain.
      const usage = makeUsage({
        "twitter.com": 900,     // 15 min
        "www.twitter.com": 960, // 16 min  → total 31 min > 30 min limit
      });
      const state = computeBlockedState("twitter.com", usage, settings);
      expect(state.blocked).toBe(true);
    });

    it("also blocks the subdomain once the combined limit is hit", () => {
      const usage = makeUsage({
        "twitter.com": 900,
        "www.twitter.com": 960,
      });
      const state = computeBlockedState("www.twitter.com", usage, settings);
      expect(state.blocked).toBe(true);
    });
  });

  describe("limit mode — group shared pool", () => {
    const settings = makeSettings({
      groups: [
        {
          id: "social",
          name: "Social",
          domains: ["twitter.com", "instagram.com"],
          mode: "limit",
          limitMinutes: 60,
          enabled: true,
        },
      ],
    });
    const limitSeconds = 60 * 60; // 3600

    it("is not blocked when total group usage is zero", () => {
      const state = computeBlockedState("twitter.com", makeUsage(), settings);
      expect(state.blocked).toBe(false);
      expect(state.remainingSeconds).toBe(limitSeconds);
    });

    it("uses the combined usage of all group members", () => {
      // 40 min on twitter, 25 min on instagram = 65 min > 60 min limit
      const usage = makeUsage({
        "twitter.com": 40 * 60,
        "instagram.com": 25 * 60,
      });
      const state = computeBlockedState("twitter.com", usage, settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_TIME_UP);
    });

    it("blocks a different group member once the shared pool is exhausted", () => {
      const usage = makeUsage({
        "twitter.com": 40 * 60,
        "instagram.com": 25 * 60,
      });
      const state = computeBlockedState("instagram.com", usage, settings);
      expect(state.blocked).toBe(true);
    });

    it("blocks a subdomain of a group member once the pool is exhausted", () => {
      const usage = makeUsage({
        "twitter.com": 40 * 60,
        "instagram.com": 25 * 60,
      });
      // m.instagram.com is a subdomain of instagram.com, which is in the group
      const state = computeBlockedState("m.instagram.com", usage, settings);
      expect(state.blocked).toBe(true);
    });

    it("includes subdomain usage in the shared pool total", () => {
      // 50 min on m.instagram.com (subdomain of instagram.com, which is in group)
      // 20 min on twitter.com → total 70 min > 60 min
      const usage = makeUsage({
        "twitter.com": 20 * 60,
        "m.instagram.com": 50 * 60,
      });
      const state = computeBlockedState("twitter.com", usage, settings);
      expect(state.blocked).toBe(true);
    });

    it("reports correct remaining seconds when pool is partially used", () => {
      const usage = makeUsage({
        "twitter.com": 20 * 60, // 20 min
        "instagram.com": 15 * 60, // 15 min  → 35 min used, 25 min left
      });
      const state = computeBlockedState("instagram.com", usage, settings);
      expect(state.blocked).toBe(false);
      expect(state.remainingSeconds).toBe(25 * 60);
    });
  });

  describe("global block list", () => {
    it("blocks a domain in the global block list", () => {
      const settings = makeSettings({ globalBlockList: ["4chan.org"] });
      const state = computeBlockedState("4chan.org", makeUsage(), settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_HARD_BLOCK);
    });
  });

  describe("global defaults — limit mode", () => {
    it("tracks each hostname independently against the global default limit", () => {
      const settings = makeSettings({
        globalDefaults: { mode: "limit", limitMinutes: 10 },
      });
      const usage = makeUsage({ "github.com": 5 * 60 }); // 5 min used
      const state = computeBlockedState("github.com", usage, settings);
      expect(state.blocked).toBe(false);
      expect(state.remainingSeconds).toBe(5 * 60);
    });

    it("blocks once global default limit is exhausted for that hostname", () => {
      const settings = makeSettings({
        globalDefaults: { mode: "limit", limitMinutes: 10 },
      });
      const usage = makeUsage({ "github.com": 11 * 60 });
      const state = computeBlockedState("github.com", usage, settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_TIME_UP);
    });
  });

  describe("precedence integration", () => {
    it("site-rule overrides group: hard-block wins over group limit", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "twitter.com", mode: "block", enabled: true }],
        groups: [
          {
            id: "social",
            name: "Social",
            domains: ["twitter.com"],
            mode: "limit",
            limitMinutes: 60,
            enabled: true,
          },
        ],
      });
      // Even with zero usage (would be fine under group limit), the site-rule blocks
      const state = computeBlockedState("twitter.com", makeUsage(), settings);
      expect(state.blocked).toBe(true);
      expect(state.message).toBe(MSG_HARD_BLOCK);
    });

    it("disabled site-rule falls through to group", () => {
      const settings = makeSettings({
        siteRules: [{ domain: "twitter.com", mode: "block", enabled: false }],
        groups: [
          {
            id: "social",
            name: "Social",
            domains: ["twitter.com"],
            mode: "limit",
            limitMinutes: 60,
            enabled: true,
          },
        ],
      });
      const state = computeBlockedState("twitter.com", makeUsage(), settings);
      expect(state.blocked).toBe(false); // under limit
      expect(state.mode).toBe("limit");
    });

    it("group overrides globalBlockList", () => {
      const settings = makeSettings({
        groups: [
          {
            id: "allowed",
            name: "Allowed",
            domains: ["youtube.com"],
            mode: "limit",
            limitMinutes: 120,
            enabled: true,
          },
        ],
        globalBlockList: ["youtube.com"],
      });
      // Group rule is matched first — globalBlockList never reached
      const state = computeBlockedState("youtube.com", makeUsage(), settings);
      expect(state.blocked).toBe(false);
      expect(state.mode).toBe("limit");
    });
  });
});
