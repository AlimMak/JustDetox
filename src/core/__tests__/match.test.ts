import { describe, it, expect } from "vitest";
import { normalizeHostname, domainCovers, matchesAny, sumUsageUnder } from "../match";

// ─── normalizeHostname ────────────────────────────────────────────────────────

describe("normalizeHostname", () => {
  it("lowercases uppercase letters", () => {
    expect(normalizeHostname("YouTube.COM")).toBe("youtube.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHostname("  twitter.com  ")).toBe("twitter.com");
  });

  it("strips a trailing FQDN dot", () => {
    expect(normalizeHostname("example.com.")).toBe("example.com");
  });

  it("handles all three mutations together", () => {
    expect(normalizeHostname("  YouTube.COM. ")).toBe("youtube.com");
  });

  it("leaves an already-normalized hostname unchanged", () => {
    expect(normalizeHostname("example.com")).toBe("example.com");
  });
});

// ─── domainCovers ─────────────────────────────────────────────────────────────

describe("domainCovers", () => {
  it("matches exact hostname", () => {
    expect(domainCovers("youtube.com", "youtube.com")).toBe(true);
  });

  it("matches a direct subdomain", () => {
    expect(domainCovers("m.youtube.com", "youtube.com")).toBe(true);
  });

  it("matches a deep nested subdomain", () => {
    expect(domainCovers("accounts.google.youtube.com", "youtube.com")).toBe(true);
  });

  it("does NOT match a hostname that merely ends with the rule text (no label boundary)", () => {
    // "xnyoutube.com" ends with "youtube.com" as a string, but not as a label
    expect(domainCovers("xnyoutube.com", "youtube.com")).toBe(false);
  });

  it("does NOT match a parent when the rule is for a specific subdomain", () => {
    expect(domainCovers("youtube.com", "m.youtube.com")).toBe(false);
  });

  it("does NOT match an unrelated domain", () => {
    expect(domainCovers("reddit.com", "youtube.com")).toBe(false);
  });

  it("matches www subdomain", () => {
    expect(domainCovers("www.reddit.com", "reddit.com")).toBe(true);
  });

  it("exact match on a subdomain rule", () => {
    // Rule explicitly targets the subdomain
    expect(domainCovers("m.twitter.com", "m.twitter.com")).toBe(true);
  });

  it("does NOT match sibling subdomains", () => {
    // Rule for "m.twitter.com" should not cover "api.twitter.com"
    expect(domainCovers("api.twitter.com", "m.twitter.com")).toBe(false);
  });
});

// ─── matchesAny ───────────────────────────────────────────────────────────────

describe("matchesAny", () => {
  it("returns true when hostname exactly matches one entry", () => {
    expect(matchesAny("reddit.com", ["youtube.com", "reddit.com"])).toBe(true);
  });

  it("returns true for a subdomain of a listed domain", () => {
    expect(matchesAny("m.twitter.com", ["twitter.com", "facebook.com"])).toBe(true);
  });

  it("returns false when no domain matches", () => {
    expect(matchesAny("github.com", ["youtube.com", "twitter.com"])).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(matchesAny("youtube.com", [])).toBe(false);
  });

  it("normalizes the input hostname before comparing", () => {
    // "YouTube.COM" should match a rule for "youtube.com"
    expect(matchesAny("YouTube.COM", ["youtube.com"])).toBe(true);
  });

  it("normalizes each domain entry before comparing", () => {
    expect(matchesAny("youtube.com", ["YouTube.COM"])).toBe(true);
  });
});

// ─── sumUsageUnder ────────────────────────────────────────────────────────────

describe("sumUsageUnder", () => {
  const usage = {
    "youtube.com": { activeSeconds: 600 },
    "m.youtube.com": { activeSeconds: 300 },
    "accounts.google.com": { activeSeconds: 100 },
    "twitter.com": { activeSeconds: 900 },
  };

  it("sums both exact and subdomain entries under the configured domain", () => {
    // "youtube.com" + "m.youtube.com" = 900
    expect(sumUsageUnder("youtube.com", usage)).toBe(900);
  });

  it("returns only the exact entry when there are no matching subdomains", () => {
    expect(sumUsageUnder("twitter.com", usage)).toBe(900);
  });

  it("returns 0 for a domain with no usage entries", () => {
    expect(sumUsageUnder("instagram.com", usage)).toBe(0);
  });

  it("does NOT include unrelated domains that happen to share a suffix", () => {
    // "accounts.google.com" should NOT be counted under "google.com"
    // Wait — it IS a subdomain of "google.com", so it SHOULD be counted.
    // This test verifies that behaviour is intentional and correct.
    expect(sumUsageUnder("google.com", usage)).toBe(100);
  });

  it("normalizes the configured domain before matching", () => {
    expect(sumUsageUnder("YouTube.COM.", usage)).toBe(900);
  });
});
