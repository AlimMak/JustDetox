import { describe, expect, it } from "vitest";
import { mergeSyncedSettings, portableSettings } from "../settingsSync";
import { DEFAULT_SETTINGS } from "../../core/types";

describe("settings sync boundaries", () => {
  it("keeps permissions and active sessions on the current device", () => {
    const current = structuredClone(DEFAULT_SETTINGS);
    current.preloadBlocking = true;
    current.lockedInSession = {
      active: true, startTs: 100, endTs: 200,
      allowedDomains: ["work.example.com"],
    };
    const portable = portableSettings(current);
    expect(portable.preloadBlocking).toBe(false);
    expect(portable.lockedInSession).toBeUndefined();

    const remote = structuredClone(DEFAULT_SETTINGS);
    remote.weeklyFocusGoalMinutes = 600;
    remote.focusPresets = [{ id: "work", name: "Work", durationMinutes: 45,
      allowedDomains: ["work.example.com"] }];
    const merged = mergeSyncedSettings(remote, current);
    expect(merged.weeklyFocusGoalMinutes).toBe(600);
    expect(merged.focusPresets).toHaveLength(1);
    expect(merged.preloadBlocking).toBe(true);
    expect(merged.lockedInSession).toEqual(current.lockedInSession);
  });
});
