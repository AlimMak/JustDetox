import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProgressHistory, recordDailyAttempt, recordDailyScore, recordDailyUsage } from "../history";
import { _resetQueueForTesting, forceFlushStorageQueue } from "../storageQueue";

let data: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 22, 12, 0, 0));
  data = {};
  vi.stubGlobal("chrome", {
    storage: { local: {
      get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: data[key] }),
      set: (items: Record<string, unknown>, callback: () => void) => { Object.assign(data, items); callback(); },
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

describe("daily progress history", () => {
  it("serializes time, attempt and score updates for the same day", async () => {
    await Promise.all([
      recordDailyUsage(15),
      recordDailyUsage(25, 20),
      recordDailyAttempt(),
      recordDailyScore(86),
    ]);
    await forceFlushStorageQueue();
    expect(await getProgressHistory()).toEqual([{
      date: "2026-09-22",
      activeSeconds: 40,
      focusSeconds: 20,
      blockedAttempts: 1,
      score: 86,
    }]);
  });

  it("drops invalid stored records", async () => {
    data.jd_progress_history = [
      { date: "2026-09-22", activeSeconds: -1, blockedAttempts: 0, score: null },
      { date: "2026-09-22", activeSeconds: 60, blockedAttempts: 2, score: null },
    ];
    expect(await getProgressHistory()).toEqual([{
      date: "2026-09-22", activeSeconds: 60, blockedAttempts: 2, score: null,
    }]);
  });
});
