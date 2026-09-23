import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDopamineScore, getSelfControlData, getTemptations, getUsage } from "../storage";
import { _resetQueueForTesting } from "../storageQueue";
import { DEFAULT_DOPAMINE_SCORE, DEFAULT_SETTINGS } from "../types";

const NOW = 1_800_000_000_000;
let data: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  data = {
    jd_settings: { ...DEFAULT_SETTINGS, resetWindow: { intervalHours: 6 } },
  };
  vi.stubGlobal("chrome", {
    storage: { local: {
      get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: data[key] }),
    } },
    runtime: { lastError: undefined },
  });
  _resetQueueForTesting();
});

afterEach(() => {
  _resetQueueForTesting();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("current-window storage reads", () => {
  it("drops expired usage and temptation records from reports", async () => {
    data.jd_usage = {
      "old.example": { activeSeconds: 3_600, lastUpdated: NOW - 7 * 3_600_000, windowStartTs: NOW - 7 * 3_600_000 },
      "new.example": { activeSeconds: 120, lastUpdated: NOW, windowStartTs: NOW - 1_000 },
    };
    data.jd_temptations = {
      "old.example": { attempts: 5, lastAttemptTs: NOW - 7 * 3_600_000, lockedInAttempts: 0, windowStartTs: NOW - 7 * 3_600_000 },
      "new.example": { attempts: 2, lastAttemptTs: NOW, lockedInAttempts: 0, windowStartTs: NOW - 1_000 },
    };
    expect(Object.keys(await getUsage())).toEqual(["new.example"]);
    expect(Object.keys(await getTemptations())).toEqual(["new.example"]);
  });

  it("starts a fresh score and graph after the window expires", async () => {
    data.jd_dopamine = { ...DEFAULT_DOPAMINE_SCORE, score: 63, windowStartTs: NOW - 7 * 3_600_000 };
    data.jd_self_control = {
      windowStartTs: NOW - 7 * 3_600_000,
      events: [{ ts: NOW - 7 * 3_600_000, domain: "old.example", type: "blocked" }],
      previousWindowCount: 0,
    };
    expect((await getDopamineScore()).score).toBe(100);
    expect((await getDopamineScore()).previousWindowScore).toBe(63);
    expect((await getSelfControlData()).events).toEqual([]);
    expect((await getSelfControlData()).previousWindowCount).toBe(1);
  });
});
