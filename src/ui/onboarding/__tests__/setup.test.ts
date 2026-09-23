import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../../../core/types";
import { buildOnboardingSettings, parseCustomDomains } from "../utils/setup";

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, siteRules: [], groups: [], globalBlockList: [], ...patch };
}

describe("onboarding setup", () => {
  it("normalizes and deduplicates custom websites", () => {
    expect(
      parseCustomDomains("https://www.Example.com/path, example.com\nnews.ycombinator.com"),
    ).toEqual({
      domains: ["example.com", "news.ycombinator.com"],
      error: null,
    });
    expect(parseCustomDomains("example.com, not a domain").error).toMatch(/not a domain/);
  });

  it("creates multiple pack groups and a custom group", () => {
    let nextId = 0;
    const next = buildOnboardingSettings(
      settings(),
      [
        { packId: "social-media", mode: "block", limitMinutes: 60 },
        { packId: "news-forums", mode: "limit", limitMinutes: 20 },
      ],
      ["example.com"],
      { mode: "limit", limitMinutes: 30 },
      12,
      () => String(++nextId),
    );
    expect(next.groups.map((group) => group.name)).toEqual([
      "Social Media",
      "News & Forums",
      "My sites",
    ]);
    expect(next.groups[0].domains).toContain("reddit.com");
    expect(next.groups[1].domains).not.toContain("reddit.com");
    expect(next.groups[2].domains).toEqual(["example.com"]);
    expect(next.resetWindow.intervalHours).toBe(12);
  });

  it("preserves existing overlapping rules and rejects a weaker default", () => {
    const current = settings({
      groups: [
        { id: "existing", name: "Work", domains: ["youtube.com"], mode: "block", enabled: true },
      ],
      globalDefaults: { mode: "block" },
    });
    expect(() =>
      buildOnboardingSettings(
        current,
        [{ packId: "video-streaming", mode: "limit", limitMinutes: 30 }],
        [],
        { mode: "limit", limitMinutes: 60 },
        24,
        () => "new",
      ),
    ).toThrow(/loosen/);
    const next = buildOnboardingSettings(
      current,
      [{ packId: "video-streaming", mode: "block", limitMinutes: 30 }],
      [],
      { mode: "limit", limitMinutes: 60 },
      24,
      () => "new",
    );
    expect(next.groups[0]).toEqual(current.groups[0]);
    expect(next.groups[1].domains).not.toContain("youtube.com");
  });

  it("keeps shorter windows behind Settings once protection exists", () => {
    const current = settings({
      resetWindow: { intervalHours: 24 },
      groups: [
        {
          id: "existing",
          name: "Work",
          domains: ["example.com"],
          mode: "limit",
          limitMinutes: 30,
          enabled: true,
        },
      ],
    });
    expect(() =>
      buildOnboardingSettings(
        current,
        [],
        [],
        { mode: "limit", limitMinutes: 60 },
        12,
        () => "new",
      ),
    ).toThrow(/Protected Gate/);

    const firstRun = buildOnboardingSettings(
      settings({ resetWindow: { intervalHours: 24 } }),
      [],
      [],
      { mode: "limit", limitMinutes: 60 },
      12,
      () => "new",
    );
    expect(firstRun.resetWindow.intervalHours).toBe(12);
  });
});
