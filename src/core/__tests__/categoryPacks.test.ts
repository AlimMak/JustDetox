// FILE: src/core/__tests__/categoryPacks.test.ts

import { describe, it, expect } from "vitest";
import {
  getAllCategoryPacks,
  getCategoryPackById,
  searchCategoryPacks,
} from "../categoryPacks";

describe("getAllCategoryPacks", () => {
  it("returns all packs (minimum 7)", () => {
    const packs = getAllCategoryPacks();
    expect(packs.length).toBeGreaterThanOrEqual(7);
  });

  it("includes the required starter pack ids", () => {
    const ids = getAllCategoryPacks().map((p) => p.id);
    const required = [
      "social-media",
      "video-streaming",
      "news-forums",
      "shopping",
      "gaming",
      "messaging",
      "ai-chat",
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it("all pack ids are unique", () => {
    const ids = getAllCategoryPacks().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all packs have at least one domain", () => {
    for (const pack of getAllCategoryPacks()) {
      expect(pack.domains.length).toBeGreaterThan(0);
    }
  });

  it("domains are normalized — no protocol", () => {
    for (const pack of getAllCategoryPacks()) {
      for (const domain of pack.domains) {
        expect(domain).not.toMatch(/^https?:\/\//);
      }
    }
  });

  it("domains are normalized — no leading www.", () => {
    for (const pack of getAllCategoryPacks()) {
      for (const domain of pack.domains) {
        expect(domain).not.toMatch(/^www\./);
      }
    }
  });

  it("domains are normalized — all lowercase", () => {
    for (const pack of getAllCategoryPacks()) {
      for (const domain of pack.domains) {
        expect(domain).toBe(domain.toLowerCase());
      }
    }
  });

  it("no duplicate domains within a pack", () => {
    for (const pack of getAllCategoryPacks()) {
      const unique = new Set(pack.domains);
      expect(unique.size).toBe(pack.domains.length);
    }
  });

  it("social-media pack contains key domains", () => {
    const pack = getCategoryPackById("social-media")!;
    expect(pack.domains).toContain("instagram.com");
    expect(pack.domains).toContain("facebook.com");
    // twitter.com and x.com are both present (different registered domains)
    expect(pack.domains).toContain("twitter.com");
    expect(pack.domains).toContain("x.com");
  });

  it("social-media pack domains do not include www prefix", () => {
    const pack = getCategoryPackById("social-media")!;
    for (const d of pack.domains) {
      expect(d).not.toMatch(/^www\./);
    }
  });

  it("news-forums pack has suggestedLimitMinutes and defaultMode limit", () => {
    const pack = getCategoryPackById("news-forums")!;
    expect(pack.defaultMode).toBe("limit");
    expect(pack.suggestedLimitMinutes).toBeGreaterThan(0);
  });

  it("video-streaming pack defaultMode is block", () => {
    const pack = getCategoryPackById("video-streaming")!;
    expect(pack.defaultMode).toBe("block");
  });

  it("gaming pack contains steampowered.com", () => {
    const pack = getCategoryPackById("gaming")!;
    expect(pack.domains).toContain("steampowered.com");
  });

  it("messaging pack contains discord.com", () => {
    const pack = getCategoryPackById("messaging")!;
    expect(pack.domains).toContain("discord.com");
  });

  it("ai-chat pack contains claude.ai and chatgpt.com", () => {
    const pack = getCategoryPackById("ai-chat")!;
    expect(pack.domains).toContain("claude.ai");
    expect(pack.domains).toContain("chatgpt.com");
  });
});

describe("getCategoryPackById", () => {
  it("returns the correct pack", () => {
    const pack = getCategoryPackById("social-media");
    expect(pack).toBeDefined();
    expect(pack!.id).toBe("social-media");
    expect(pack!.name).toBe("Social Media");
  });

  it("returns undefined for unknown id", () => {
    expect(getCategoryPackById("does-not-exist")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getCategoryPackById("")).toBeUndefined();
  });
});

describe("searchCategoryPacks", () => {
  it("empty query returns all packs", () => {
    const all = getAllCategoryPacks();
    expect(searchCategoryPacks("").length).toBe(all.length);
  });

  it("whitespace-only query returns all packs", () => {
    const all = getAllCategoryPacks();
    expect(searchCategoryPacks("   ").length).toBe(all.length);
  });

  it("matches by pack name (partial)", () => {
    const results = searchCategoryPacks("social");
    expect(results.some((p) => p.id === "social-media")).toBe(true);
  });

  it("matches by pack name (case insensitive)", () => {
    const results = searchCategoryPacks("GAMING");
    expect(results.some((p) => p.id === "gaming")).toBe(true);
  });

  it("matches by domain substring", () => {
    const results = searchCategoryPacks("youtube");
    expect(results.some((p) => p.id === "video-streaming")).toBe(true);
  });

  it("matches by partial domain", () => {
    const results = searchCategoryPacks("netflix");
    expect(results.some((p) => p.id === "video-streaming")).toBe(true);
  });

  it("no match returns empty array", () => {
    expect(searchCategoryPacks("zzznomatch999")).toHaveLength(0);
  });

  it("search for 'chat' returns ai-chat pack", () => {
    const results = searchCategoryPacks("chat");
    expect(results.some((p) => p.id === "ai-chat")).toBe(true);
  });

  it("search for 'discord' returns messaging pack", () => {
    const results = searchCategoryPacks("discord");
    expect(results.some((p) => p.id === "messaging")).toBe(true);
  });
});
