import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importAll } from "../storage";
import { _resetQueueForTesting } from "../storageQueue";
import { DEFAULT_SETTINGS } from "../types";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {
    jd_usage: {
      "example.com": { activeSeconds: 600, lastUpdated: Date.now(), windowStartTs: Date.now() },
    },
  };
  vi.stubGlobal("chrome", {
    storage: { local: {
      get: (key: string | string[], callback: (result: Record<string, unknown>) => void) => {
        const keys = Array.isArray(key) ? key : [key];
        callback(Object.fromEntries(keys.map((item) => [item, data[item]])));
      },
      set: (items: Record<string, unknown>, callback: () => void) => { Object.assign(data, items); callback(); },
    } },
    runtime: { lastError: undefined },
  });
  _resetQueueForTesting();
});

afterEach(() => {
  _resetQueueForTesting();
  vi.unstubAllGlobals();
});

describe("backup import", () => {
  it("preserves active usage when importing settings only", async () => {
    const previousUsage = data.jd_usage;
    const result = await importAll(JSON.stringify({
      exportedAt: new Date().toISOString(),
      settings: DEFAULT_SETTINGS,
    }));
    expect(result.ok).toBe(true);
    expect(data.jd_usage).toEqual(previousUsage);
  });

  it("rejects an enabled Focus Environment with no allowed sites", async () => {
    const result = await importAll(JSON.stringify({
      settings: {
        ...DEFAULT_SETTINGS,
        allowlistMode: { enabled: true, allowedDomains: [] },
      },
    }));
    expect(result.ok).toBe(false);
    expect(data.jd_settings).toBeUndefined();
  });
});
