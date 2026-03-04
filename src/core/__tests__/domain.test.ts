import { describe, it, expect } from "vitest";
import { normalizeDomain, domainMatches } from "../domain";

// ─── normalizeDomain ──────────────────────────────────────────────────────────

describe("normalizeDomain", () => {
  // ── Whitespace & case ────────────────────────────────────────────────────────

  it("trims leading and trailing whitespace", () => {
    expect(normalizeDomain("  youtube.com  ")).toBe("youtube.com");
  });

  it("lowercases uppercase input", () => {
    expect(normalizeDomain("YouTube.COM")).toBe("youtube.com");
  });

  it("handles combined whitespace and case", () => {
    expect(normalizeDomain("  REDDIT.COM  ")).toBe("reddit.com");
  });

  // ── Protocol stripping ───────────────────────────────────────────────────────

  it("strips https:// protocol", () => {
    expect(normalizeDomain("https://youtube.com")).toBe("youtube.com");
  });

  it("strips http:// protocol", () => {
    expect(normalizeDomain("http://youtube.com")).toBe("youtube.com");
  });

  it("strips protocol with mixed case", () => {
    expect(normalizeDomain("HTTPS://YouTube.com")).toBe("youtube.com");
  });

  // ── Path stripping ───────────────────────────────────────────────────────────

  it("strips path from bare domain", () => {
    expect(normalizeDomain("youtube.com/watch")).toBe("youtube.com");
  });

  it("strips /shorts/ path", () => {
    expect(normalizeDomain("youtube.com/shorts/abc")).toBe("youtube.com");
  });

  it("strips /embed/ path", () => {
    expect(normalizeDomain("youtube.com/embed/abc123")).toBe("youtube.com");
  });

  it("strips /results path", () => {
    expect(normalizeDomain("youtube.com/results")).toBe("youtube.com");
  });

  it("strips path from full URL with protocol", () => {
    expect(normalizeDomain("https://youtube.com/watch?v=abc")).toBe("youtube.com");
  });

  // ── Query-string stripping ───────────────────────────────────────────────────

  it("strips query-string", () => {
    expect(normalizeDomain("youtube.com?query=123")).toBe("youtube.com");
  });

  it("strips query-string from full URL", () => {
    expect(normalizeDomain("https://youtube.com?autoplay=1")).toBe("youtube.com");
  });

  // ── Fragment stripping ───────────────────────────────────────────────────────

  it("strips fragment", () => {
    expect(normalizeDomain("reddit.com#comments")).toBe("reddit.com");
  });

  // ── Port stripping ───────────────────────────────────────────────────────────

  it("strips port number", () => {
    expect(normalizeDomain("localhost:3000")).toBe("localhost");
  });

  it("strips port from full domain", () => {
    expect(normalizeDomain("example.com:8080")).toBe("example.com");
  });

  // ── Trailing FQDN dot ────────────────────────────────────────────────────────

  it("strips trailing FQDN dot", () => {
    expect(normalizeDomain("youtube.com.")).toBe("youtube.com");
  });

  // ── www. prefix stripping ────────────────────────────────────────────────────

  it("strips leading www. prefix", () => {
    expect(normalizeDomain("www.youtube.com")).toBe("youtube.com");
  });

  it("strips www. from a domain with protocol", () => {
    expect(normalizeDomain("https://www.youtube.com")).toBe("youtube.com");
  });

  it("strips www. from a full URL with path and query", () => {
    expect(normalizeDomain("https://www.youtube.com/watch?v=abc")).toBe("youtube.com");
  });

  it("does NOT strip non-www subdomains", () => {
    expect(normalizeDomain("m.youtube.com")).toBe("m.youtube.com");
  });

  it("does NOT strip studio. subdomain", () => {
    expect(normalizeDomain("studio.youtube.com")).toBe("studio.youtube.com");
  });

  it("does NOT strip api. subdomain", () => {
    expect(normalizeDomain("api.twitter.com")).toBe("api.twitter.com");
  });

  it("strips www. from reddit", () => {
    expect(normalizeDomain("www.reddit.com")).toBe("reddit.com");
  });

  // ── Combined normalization ───────────────────────────────────────────────────

  it("handles a full messy URL end-to-end", () => {
    expect(
      normalizeDomain("  HTTPS://WWW.YouTube.com/watch?v=abc&feature=home#top  "),
    ).toBe("youtube.com");
  });

  it("handles https + www + path + query", () => {
    expect(normalizeDomain("https://www.reddit.com/r/all?sort=new")).toBe("reddit.com");
  });

  it("leaves an already-normalized domain unchanged", () => {
    expect(normalizeDomain("youtube.com")).toBe("youtube.com");
  });

  it("leaves a non-www subdomain domain unchanged", () => {
    expect(normalizeDomain("m.twitter.com")).toBe("m.twitter.com");
  });
});

// ─── domainMatches ────────────────────────────────────────────────────────────

describe("domainMatches", () => {
  // ── Exact matches ────────────────────────────────────────────────────────────

  it("matches the exact same domain", () => {
    expect(domainMatches("youtube.com", "youtube.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(domainMatches("YouTube.COM", "youtube.com")).toBe(true);
  });

  // ── www. normalization ───────────────────────────────────────────────────────

  it("matches www.youtube.com against a youtube.com rule (www is stripped)", () => {
    expect(domainMatches("youtube.com", "www.youtube.com")).toBe(true);
  });

  it("matches when blocked domain has www. (rule stored with www.)", () => {
    // If somehow a rule was stored as www.youtube.com, it normalizes to youtube.com
    expect(domainMatches("www.youtube.com", "youtube.com")).toBe(true);
  });

  it("both sides with www. normalize to the same root", () => {
    expect(domainMatches("www.youtube.com", "www.youtube.com")).toBe(true);
  });

  // ── Subdomain matching ───────────────────────────────────────────────────────

  it("matches m.youtube.com against youtube.com rule", () => {
    expect(domainMatches("youtube.com", "m.youtube.com")).toBe(true);
  });

  it("matches studio.youtube.com against youtube.com rule", () => {
    expect(domainMatches("youtube.com", "studio.youtube.com")).toBe(true);
  });

  it("matches a deep nested subdomain", () => {
    expect(domainMatches("youtube.com", "accounts.regional.youtube.com")).toBe(true);
  });

  it("matches old.reddit.com against reddit.com rule", () => {
    expect(domainMatches("reddit.com", "old.reddit.com")).toBe(true);
  });

  it("matches m.twitter.com against twitter.com rule", () => {
    expect(domainMatches("twitter.com", "m.twitter.com")).toBe(true);
  });

  // ── Non-matches ──────────────────────────────────────────────────────────────

  it("does NOT match an unrelated domain", () => {
    expect(domainMatches("youtube.com", "google.com")).toBe(false);
  });

  it("does NOT match a domain that merely ends with the rule text (no label boundary)", () => {
    // "xnyoutube.com" ends with "youtube.com" as a string, not as a label
    expect(domainMatches("youtube.com", "xnyoutube.com")).toBe(false);
  });

  it("does NOT match a parent domain against a subdomain rule", () => {
    // Rule is for m.youtube.com — bare youtube.com should not match
    expect(domainMatches("m.youtube.com", "youtube.com")).toBe(false);
  });

  it("does NOT match sibling subdomains", () => {
    // Rule for m.twitter.com should not cover api.twitter.com
    expect(domainMatches("m.twitter.com", "api.twitter.com")).toBe(false);
  });

  // ── Path / URL inputs ────────────────────────────────────────────────────────

  it("strips path from hostname input before matching", () => {
    // Defensive: even if a full URL is passed, it normalizes correctly
    expect(domainMatches("youtube.com", "https://www.youtube.com/watch?v=abc")).toBe(true);
  });

  it("strips path from blocked domain before matching", () => {
    expect(domainMatches("https://youtube.com/shorts", "m.youtube.com")).toBe(true);
  });
});
