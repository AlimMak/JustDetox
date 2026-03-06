import { describe, it, expect, beforeEach } from "vitest";
import {
  buildRuleIndex,
  resolveDomainRule,
  getOrBuildIndex,
  invalidateRuleIndex,
} from "../ruleIndex";
import type { RuleIndex } from "../ruleIndex";
import type { Settings, SiteRule, SiteGroup } from "../types";
import { DEFAULT_SETTINGS } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function blockRule(domain: string, enabled = true): SiteRule {
  return { domain, mode: "block", enabled };
}

function limitRule(domain: string, limitMinutes: number, enabled = true): SiteRule {
  return { domain, mode: "limit", limitMinutes, enabled };
}

function makeGroup(
  id: string,
  domains: string[],
  mode: "block" | "limit" = "block",
  enabled = true,
): SiteGroup {
  return { id, name: id, domains, mode, enabled };
}

// Reset module-level cache between tests.
beforeEach(() => invalidateRuleIndex());

// ─── buildRuleIndex ────────────────────────────────────────────────────────────

describe("buildRuleIndex", () => {
  describe("site rules", () => {
    it("inserts an enabled rule under its normalized domain", () => {
      const index = buildRuleIndex(
        makeSettings({ siteRules: [blockRule("youtube.com")] }),
      );
      expect(index.siteRules.has("youtube.com")).toBe(true);
    });

    it("skips disabled rules", () => {
      const index = buildRuleIndex(
        makeSettings({ siteRules: [blockRule("youtube.com", false)] }),
      );
      expect(index.siteRules.has("youtube.com")).toBe(false);
    });

    it("normalizes domain keys (strips www.? — no, normalizeHostname only lowercases)", () => {
      // normalizeHostname lowercases and strips trailing dot only
      const index = buildRuleIndex(
        makeSettings({ siteRules: [blockRule("YouTube.COM")] }),
      );
      expect(index.siteRules.has("youtube.com")).toBe(true);
    });

    it("preserves array-order: first enabled rule for a domain wins", () => {
      const first = limitRule("youtube.com", 30);
      const second = blockRule("youtube.com");
      const index = buildRuleIndex(
        makeSettings({ siteRules: [first, second] }),
      );
      expect(index.siteRules.get("youtube.com")?.mode).toBe("limit");
    });

    it("stores multiple distinct domains", () => {
      const index = buildRuleIndex(
        makeSettings({
          siteRules: [blockRule("youtube.com"), blockRule("reddit.com")],
        }),
      );
      expect(index.siteRules.has("youtube.com")).toBe(true);
      expect(index.siteRules.has("reddit.com")).toBe(true);
    });
  });

  describe("group rules", () => {
    it("inserts each group domain under its normalized key", () => {
      const group = makeGroup("social", ["twitter.com", "instagram.com"]);
      const index = buildRuleIndex(makeSettings({ groups: [group] }));
      expect(index.groupRules.get("twitter.com")?.id).toBe("social");
      expect(index.groupRules.get("instagram.com")?.id).toBe("social");
    });

    it("skips disabled groups", () => {
      const group = makeGroup("social", ["twitter.com"], "block", false);
      const index = buildRuleIndex(makeSettings({ groups: [group] }));
      expect(index.groupRules.has("twitter.com")).toBe(false);
    });

    it("first group claiming a domain wins", () => {
      const g1 = makeGroup("g1", ["shared.com"]);
      const g2 = makeGroup("g2", ["shared.com"]);
      const index = buildRuleIndex(makeSettings({ groups: [g1, g2] }));
      expect(index.groupRules.get("shared.com")?.id).toBe("g1");
    });
  });

  describe("global block list", () => {
    it("inserts normalized domains into the set", () => {
      const index = buildRuleIndex(
        makeSettings({ globalBlockList: ["tiktok.com", "snapchat.com"] }),
      );
      expect(index.globalBlockDomains.has("tiktok.com")).toBe(true);
      expect(index.globalBlockDomains.has("snapchat.com")).toBe(true);
    });

    it("normalizes domain case", () => {
      const index = buildRuleIndex(
        makeSettings({ globalBlockList: ["TikTok.COM"] }),
      );
      expect(index.globalBlockDomains.has("tiktok.com")).toBe(true);
    });
  });

  describe("empty settings", () => {
    it("returns empty maps and set when there are no rules", () => {
      const index = buildRuleIndex(makeSettings());
      expect(index.siteRules.size).toBe(0);
      expect(index.groupRules.size).toBe(0);
      expect(index.globalBlockDomains.size).toBe(0);
    });
  });
});

// ─── resolveDomainRule ────────────────────────────────────────────────────────

describe("resolveDomainRule", () => {
  let index: RuleIndex;

  // ── Spec Case 1: subdomain under site rule ──────────────────────────────────

  describe("case 1 — youtube.com site rule covers studio.youtube.com", () => {
    beforeEach(() => {
      index = buildRuleIndex(
        makeSettings({ siteRules: [blockRule("youtube.com")] }),
      );
    });

    it("matches the exact domain", () => {
      expect(resolveDomainRule("youtube.com", index)?.kind).toBe("site");
    });

    it("matches studio.youtube.com via suffix probe", () => {
      const r = resolveDomainRule("studio.youtube.com", index);
      expect(r?.kind).toBe("site");
    });

    it("matches m.youtube.com", () => {
      expect(resolveDomainRule("m.youtube.com", index)?.kind).toBe("site");
    });

    it("matches a deeply nested subdomain", () => {
      expect(resolveDomainRule("accounts.regional.youtube.com", index)?.kind).toBe("site");
    });
  });

  // ── Spec Case 2: subdomain under group rule ─────────────────────────────────

  describe("case 2 — reddit.com group rule covers old.reddit.com", () => {
    beforeEach(() => {
      index = buildRuleIndex(
        makeSettings({ groups: [makeGroup("news", ["reddit.com"])] }),
      );
    });

    it("matches old.reddit.com", () => {
      const r = resolveDomainRule("old.reddit.com", index);
      expect(r?.kind).toBe("group");
      if (r?.kind === "group") expect(r.group.id).toBe("news");
    });

    it("matches the exact domain reddit.com", () => {
      expect(resolveDomainRule("reddit.com", index)?.kind).toBe("group");
    });
  });

  // ── Spec Case 3: subdomain under global block list ──────────────────────────

  describe("case 3 — google.com in global block list covers mail.google.com", () => {
    beforeEach(() => {
      index = buildRuleIndex(
        makeSettings({ globalBlockList: ["google.com"] }),
      );
    });

    it("matches mail.google.com", () => {
      expect(resolveDomainRule("mail.google.com", index)?.kind).toBe("global-block");
    });

    it("matches drive.google.com", () => {
      expect(resolveDomainRule("drive.google.com", index)?.kind).toBe("global-block");
    });

    it("matches the exact domain google.com", () => {
      expect(resolveDomainRule("google.com", index)?.kind).toBe("global-block");
    });
  });

  // ── Spec Case 4: no match ───────────────────────────────────────────────────

  describe("case 4 — no rule for vimeo.com", () => {
    beforeEach(() => {
      index = buildRuleIndex(
        makeSettings({ siteRules: [blockRule("youtube.com")] }),
      );
    });

    it("returns null for an unrelated domain", () => {
      expect(resolveDomainRule("vimeo.com", index)).toBeNull();
    });

    it("does NOT match a domain that merely shares a suffix string", () => {
      // "xnyoutube.com" ends with "youtube.com" as a string but not as a label
      expect(resolveDomainRule("xnyoutube.com", index)).toBeNull();
    });
  });

  // ── Tier precedence ────────────────────────────────────────────────────────

  describe("tier precedence", () => {
    it("site rule beats group rule for the same domain", () => {
      index = buildRuleIndex(
        makeSettings({
          siteRules: [blockRule("twitter.com")],
          groups: [makeGroup("social", ["twitter.com"], "limit")],
        }),
      );
      const r = resolveDomainRule("twitter.com", index);
      expect(r?.kind).toBe("site");
      if (r?.kind === "site") expect(r.rule.mode).toBe("block");
    });

    it("site rule beats group rule for subdomain", () => {
      // Site rule for youtube.com, group rule for m.youtube.com
      // Site tier is checked exhaustively first — youtube.com is found
      // at the second suffix level, before group rules are checked.
      index = buildRuleIndex(
        makeSettings({
          siteRules: [blockRule("youtube.com")],
          groups: [makeGroup("video", ["m.youtube.com"])],
        }),
      );
      const r = resolveDomainRule("m.youtube.com", index);
      expect(r?.kind).toBe("site");
    });

    it("group rule beats global block list", () => {
      index = buildRuleIndex(
        makeSettings({
          groups: [makeGroup("g", ["example.com"], "limit")],
          globalBlockList: ["example.com"],
        }),
      );
      const r = resolveDomainRule("example.com", index);
      expect(r?.kind).toBe("group");
    });

    it("more specific site rule (subdomain) wins over general site rule (parent)", () => {
      // Both m.youtube.com and youtube.com are site rules.
      // The index check for "m.youtube.com" hits m.youtube.com first.
      index = buildRuleIndex(
        makeSettings({
          siteRules: [limitRule("m.youtube.com", 30), blockRule("youtube.com")],
        }),
      );
      const r = resolveDomainRule("m.youtube.com", index);
      expect(r?.kind).toBe("site");
      if (r?.kind === "site") expect(r.rule.mode).toBe("limit");
    });
  });

  // ── Normalization ──────────────────────────────────────────────────────────

  describe("hostname normalization", () => {
    beforeEach(() => {
      index = buildRuleIndex(
        makeSettings({ siteRules: [blockRule("youtube.com")] }),
      );
    });

    it("normalizes hostname to lowercase before lookup", () => {
      expect(resolveDomainRule("YouTube.COM", index)?.kind).toBe("site");
    });

    it("strips trailing FQDN dot from hostname", () => {
      expect(resolveDomainRule("youtube.com.", index)?.kind).toBe("site");
    });
  });
});

// ─── getOrBuildIndex (cache) ──────────────────────────────────────────────────

describe("getOrBuildIndex", () => {
  it("returns the same object for the same settings reference", () => {
    const settings = makeSettings({ siteRules: [blockRule("youtube.com")] });
    const a = getOrBuildIndex(settings);
    const b = getOrBuildIndex(settings);
    expect(a).toBe(b); // referential equality — same cached object
  });

  it("rebuilds when settings reference changes", () => {
    const s1 = makeSettings({ siteRules: [blockRule("youtube.com")] });
    const s2 = makeSettings({ siteRules: [blockRule("reddit.com")] });
    const i1 = getOrBuildIndex(s1);
    const i2 = getOrBuildIndex(s2);
    expect(i1).not.toBe(i2);
    expect(i2.siteRules.has("reddit.com")).toBe(true);
    expect(i2.siteRules.has("youtube.com")).toBe(false);
  });

  it("rebuilds after invalidateRuleIndex is called", () => {
    const settings = makeSettings({ siteRules: [blockRule("youtube.com")] });
    const before = getOrBuildIndex(settings);
    invalidateRuleIndex();
    const after = getOrBuildIndex(settings);
    // Different objects (rebuilt), but logically equivalent
    expect(after).not.toBe(before);
    expect(after.siteRules.has("youtube.com")).toBe(true);
  });

  it("reflects the correct rules after invalidation with new settings", () => {
    const s1 = makeSettings({ siteRules: [blockRule("youtube.com")] });
    getOrBuildIndex(s1); // prime cache with s1
    invalidateRuleIndex();
    const s2 = makeSettings({ siteRules: [blockRule("reddit.com")] });
    const index = getOrBuildIndex(s2);
    expect(index.siteRules.has("reddit.com")).toBe(true);
    expect(index.siteRules.has("youtube.com")).toBe(false);
  });
});

// ─── Performance: 100+ rules, 1 000 lookups ───────────────────────────────────

describe("performance", () => {
  it("resolves 1 000 lookups across 100+ site rules within 50 ms", () => {
    // Build 120 site rules.
    const siteRules: SiteRule[] = Array.from({ length: 120 }, (_, i) =>
      blockRule(`site${i}.com`),
    );
    // The target rule is the last one in the list — worst case for linear scan.
    siteRules.push(blockRule("target.com"));

    const settings = makeSettings({ siteRules });
    const index = buildRuleIndex(settings);

    const start = performance.now();
    for (let i = 0; i < 1_000; i++) {
      resolveDomainRule("sub.target.com", index);
    }
    const elapsed = performance.now() - start;

    // Should be well under 50 ms even on a slow machine.
    expect(elapsed).toBeLessThan(50);
  });

  it("resolves 1 000 lookups across 10 groups (10 domains each) within 50 ms", () => {
    const groups: SiteGroup[] = Array.from({ length: 10 }, (_, gi) =>
      makeGroup(
        `group${gi}`,
        Array.from({ length: 10 }, (__, di) => `site${gi * 10 + di}.com`),
      ),
    );
    // Target domain is in the last group.
    groups.push(makeGroup("target-group", ["target.com"]));

    const settings = makeSettings({ groups });
    const index = buildRuleIndex(settings);

    const start = performance.now();
    for (let i = 0; i < 1_000; i++) {
      resolveDomainRule("deep.sub.target.com", index);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it("buildRuleIndex with 200 rules completes within 20 ms", () => {
    const siteRules: SiteRule[] = Array.from({ length: 200 }, (_, i) =>
      blockRule(`rule${i}.com`),
    );
    const settings = makeSettings({ siteRules });

    const start = performance.now();
    buildRuleIndex(settings);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });
});
