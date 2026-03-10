/**
 * Unit tests for iframeBlocker — pure-function layer only.
 *
 * DOM-dependent functions (buildBlockedPlaceholder, processIframe,
 * initIframeBlocker) require a browser environment and are verified
 * through manual extension testing per the verification scenarios in the
 * feature spec.
 *
 * These tests run in Node (vitest environment: "node") and cover:
 *  1. extractIframeDomain — iframe src → hostname extraction
 *  2. Domain matching — confirming existing domainMatches() covers
 *     the iframe-specific cases (subdomain embed URLs, etc.)
 */

import { describe, it, expect } from "vitest";
import { extractIframeDomain } from "../iframeBlocker";
import { domainMatches } from "../../core/domain";

// ─── extractIframeDomain ──────────────────────────────────────────────────────

describe("extractIframeDomain", () => {
  // ── Happy-path HTTP/HTTPS ──────────────────────────────────────────────────

  it("extracts hostname from https YouTube embed URL", () => {
    expect(extractIframeDomain("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "www.youtube.com",
    );
  });

  it("extracts hostname from http Vimeo player URL", () => {
    expect(extractIframeDomain("http://player.vimeo.com/video/123456")).toBe(
      "player.vimeo.com",
    );
  });

  it("extracts hostname from Twitter embed URL", () => {
    expect(
      extractIframeDomain("https://platform.twitter.com/embed/Tweet.html?id=1"),
    ).toBe("platform.twitter.com");
  });

  it("extracts bare hostname when no path", () => {
    expect(extractIframeDomain("https://example.com")).toBe("example.com");
  });

  it("handles URLs with query strings", () => {
    expect(
      extractIframeDomain("https://player.spotify.com/embed?uri=spotify:track:abc"),
    ).toBe("player.spotify.com");
  });

  it("handles URLs with ports (port not included in hostname)", () => {
    expect(extractIframeDomain("https://example.com:8080/embed")).toBe("example.com");
  });

  it("handles HTTPS with fragment", () => {
    expect(extractIframeDomain("https://example.com/embed#section")).toBe(
      "example.com",
    );
  });

  // ── Non-HTTP schemes → null ────────────────────────────────────────────────

  it("returns null for blob: URLs", () => {
    expect(extractIframeDomain("blob:https://example.com/some-uuid")).toBeNull();
  });

  it("returns null for javascript: URLs", () => {
    expect(extractIframeDomain("javascript:void(0)")).toBeNull();
  });

  it("returns null for about:blank", () => {
    expect(extractIframeDomain("about:blank")).toBeNull();
  });

  it("returns null for data: URLs", () => {
    expect(extractIframeDomain("data:text/html,<p>hello</p>")).toBeNull();
  });

  it("returns null for chrome-extension: URLs", () => {
    expect(extractIframeDomain("chrome-extension://abc/page.html")).toBeNull();
  });

  // ── Empty / malformed → null ───────────────────────────────────────────────

  it("returns null for empty string", () => {
    expect(extractIframeDomain("")).toBeNull();
  });

  it("returns null for plain text (not a URL)", () => {
    expect(extractIframeDomain("not a url")).toBeNull();
  });

  it("returns null for a bare domain without protocol", () => {
    // "youtube.com" alone is not a valid URL — new URL() would throw.
    expect(extractIframeDomain("youtube.com/embed/abc")).toBeNull();
  });

  it("returns null for URL with no hostname", () => {
    // Edge case: a URL whose hostname is empty string.
    expect(extractIframeDomain("file:///local/file.html")).toBeNull();
  });
});

// ─── Domain matching for iframe scenarios ────────────────────────────────────
//
// The iframe blocker sends the extracted hostname (e.g. "www.youtube.com")
// to the background via CHECK_URL. The background calls computeBlockedState
// which internally calls normalizeHostname → normalizeDomain.
//
// These tests confirm that the existing domainMatches() utility (used by the
// background's rule-matching layer) covers iframe embed URL patterns correctly,
// so no special-casing is needed in the iframe code path.

describe("domainMatches — iframe embed URL scenarios", () => {
  it("www.youtube.com is covered by a youtube.com rule", () => {
    expect(domainMatches("youtube.com", "www.youtube.com")).toBe(true);
  });

  it("platform.twitter.com is covered by a twitter.com rule", () => {
    expect(domainMatches("twitter.com", "platform.twitter.com")).toBe(true);
  });

  it("player.vimeo.com is covered by a vimeo.com rule", () => {
    expect(domainMatches("vimeo.com", "player.vimeo.com")).toBe(true);
  });

  it("player.spotify.com is covered by a spotify.com rule", () => {
    expect(domainMatches("spotify.com", "player.spotify.com")).toBe(true);
  });

  it("instagram.com embeds are covered by an instagram.com rule", () => {
    expect(domainMatches("instagram.com", "www.instagram.com")).toBe(true);
  });

  it("an unrelated domain is NOT covered", () => {
    expect(domainMatches("youtube.com", "vimeo.com")).toBe(false);
  });

  it("a lookalike domain is NOT covered (label boundary enforced)", () => {
    expect(domainMatches("youtube.com", "fakeyoutube.com")).toBe(false);
  });

  it("exact match works without subdomains", () => {
    expect(domainMatches("example.com", "example.com")).toBe(true);
  });
});
