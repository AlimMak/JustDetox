import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../../../core/types";
import { addQuickRule, getQuickActionState } from "../utils/quickActions";

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, siteRules: [], groups: [], globalBlockList: [], ...patch };
}

describe("popup quick actions", () => {
  it("adds a normalized block rule on an unrestricted site", () => {
    const current = settings();
    const next = addQuickRule(current, "www.Example.com", { mode: "block" });
    expect(next.siteRules).toEqual([{ domain: "example.com", mode: "block", enabled: true }]);
    expect(current.siteRules).toEqual([]);
  });

  it("adds a time limit only where no rule already applies", () => {
    const current = settings();
    const next = addQuickRule(current, "example.com", { mode: "limit", minutes: 30 });
    expect(next.siteRules[0].limitMinutes).toBe(30);
    expect(() => addQuickRule(next, "example.com", { mode: "limit", minutes: 60 })).toThrow();
  });

  it("does not loosen a blocked group with a new site limit", () => {
    const current = settings({
      groups: [{ id: "g1", name: "Video", domains: ["youtube.com"], mode: "block", enabled: true }],
    });
    const actions = getQuickActionState(current, "m.youtube.com");
    expect(actions.canSetLimit).toBe(false);
    expect(actions.canBlock).toBe(false);
    expect(actions.editHash).toBe("#groups");
    expect(() => addQuickRule(current, "m.youtube.com", { mode: "limit", minutes: 15 })).toThrow();
  });

  it("can strengthen a limited group with a site block", () => {
    const current = settings({
      groups: [
        {
          id: "g1",
          name: "Video",
          domains: ["youtube.com"],
          mode: "limit",
          limitMinutes: 60,
          enabled: true,
        },
      ],
    });
    const actions = getQuickActionState(current, "youtube.com");
    expect(actions.canBlock).toBe(true);
    expect(actions.canSetLimit).toBe(false);
    expect(addQuickRule(current, "youtube.com", { mode: "block" }).siteRules).toHaveLength(1);
  });

  it("routes an existing or disabled site rule to the editor", () => {
    const current = settings({
      siteRules: [{ domain: "example.com", mode: "limit", limitMinutes: 30, enabled: false }],
    });
    const actions = getQuickActionState(current, "www.example.com");
    expect(actions.canBlock).toBe(false);
    expect(actions.canSetLimit).toBe(false);
    expect(actions.editHash).toBe("#sites");
    const childRule = settings({
      siteRules: [{ domain: "m.example.com", mode: "limit", limitMinutes: 30, enabled: true }],
    });
    expect(getQuickActionState(childRule, "example.com").canBlock).toBe(false);
  });

  it("does not offer quick writes while focus mode or the master pause is active", () => {
    expect(getQuickActionState(settings({ disabled: true }), "example.com").canBlock).toBe(false);
    expect(
      getQuickActionState(
        settings({
          allowlistMode: { enabled: true, allowedDomains: [] },
        }),
        "example.com",
      ).canBlock,
    ).toBe(false);
  });
});
