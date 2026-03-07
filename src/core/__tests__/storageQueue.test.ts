import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  queueStorageReplace,
  readThrough,
  flushStorageQueue,
  forceFlushStorageQueue,
  getQueueStats,
  _resetQueueForTesting,
} from "../storageQueue";

// ─── Chrome stub ──────────────────────────────────────────────────────────────

function makeChromeSpy() {
  const calls: Array<{ items: Record<string, unknown>; callback: () => void }> = [];
  const spy = vi.fn((items: Record<string, unknown>, callback: () => void) => {
    calls.push({ items, callback });
    // Flush synchronously by default so tests don't need real timers.
    callback();
  });
  return { spy, calls };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let chromeSpy: ReturnType<typeof makeChromeSpy>;

beforeEach(() => {
  vi.useFakeTimers();
  chromeSpy = makeChromeSpy();

  vi.stubGlobal("chrome", {
    storage: {
      local: {
        set: chromeSpy.spy,
      },
    },
    runtime: {
      lastError: undefined,
    },
  });

  _resetQueueForTesting();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── readThrough ──────────────────────────────────────────────────────────────

describe("readThrough", () => {
  it("returns undefined when no write is pending", () => {
    expect(readThrough("jd_usage")).toBeUndefined();
  });

  it("returns the queued value immediately after queueStorageReplace", () => {
    const map = { "youtube.com": { activeSeconds: 42, lastUpdated: 0, windowStartTs: 0 } };
    queueStorageReplace("jd_usage", map);
    expect(readThrough("jd_usage")).toBe(map);
  });

  it("returns undefined after a successful flush", async () => {
    queueStorageReplace("jd_usage", {});
    await forceFlushStorageQueue();
    expect(readThrough("jd_usage")).toBeUndefined();
  });

  it("returns the latest value when the same key is queued multiple times", () => {
    const first = { a: 1 };
    const second = { a: 2 };
    queueStorageReplace("jd_usage", first);
    queueStorageReplace("jd_usage", second);
    expect(readThrough("jd_usage")).toBe(second);
  });
});

// ─── queueStorageReplace ──────────────────────────────────────────────────────

describe("queueStorageReplace", () => {
  it("coalesces multiple writes to the same key into one set call", async () => {
    queueStorageReplace("jd_usage", { a: 1 });
    queueStorageReplace("jd_usage", { a: 2 });
    queueStorageReplace("jd_usage", { a: 3 });
    await forceFlushStorageQueue();
    // Only one chrome.storage.local.set should have been made.
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    expect(chromeSpy.spy.mock.calls[0][0]).toEqual({ jd_usage: { a: 3 } });
  });

  it("batches multiple distinct keys into a single set call", async () => {
    queueStorageReplace("jd_usage", { a: 1 });
    queueStorageReplace("jd_temptations", { b: 2 });
    queueStorageReplace("jd_dopamine", { score: 90 });
    await forceFlushStorageQueue();
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    const written = chromeSpy.spy.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(written)).toHaveLength(3);
    expect(written["jd_usage"]).toEqual({ a: 1 });
    expect(written["jd_temptations"]).toEqual({ b: 2 });
    expect(written["jd_dopamine"]).toEqual({ score: 90 });
  });

  it("increments setCallsSaved stat when same key is overwritten", () => {
    _resetQueueForTesting();
    queueStorageReplace("jd_usage", { a: 1 });
    queueStorageReplace("jd_usage", { a: 2 });
    queueStorageReplace("jd_usage", { a: 3 });
    // setCallsSaved starts at 0; each overwrite of an existing key increments it.
    expect(getQueueStats().setCallsSaved).toBe(2);
  });
});

// ─── Debounce batching ────────────────────────────────────────────────────────

describe("debounce batching", () => {
  it("does NOT call chrome.storage.local.set before the debounce timer fires", () => {
    queueStorageReplace("jd_usage", { a: 1 });
    // Timer hasn't fired yet.
    expect(chromeSpy.spy).not.toHaveBeenCalled();
  });

  it("calls chrome.storage.local.set once after debounce expires", async () => {
    queueStorageReplace("jd_usage", { a: 1 });
    queueStorageReplace("jd_usage", { a: 2 });
    vi.advanceTimersByTime(1_100); // past DEBOUNCE_MS = 1_000
    // Let the microtask queue drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
  });

  it("coalesces writes that arrive within the debounce window", async () => {
    queueStorageReplace("jd_usage", { a: 1 });
    vi.advanceTimersByTime(500);
    queueStorageReplace("jd_usage", { a: 2 });
    vi.advanceTimersByTime(1_100);
    await Promise.resolve();
    await Promise.resolve();
    // Both writes happened within the debounce window, but a second write
    // within the window resets the timer — only one flush.
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    expect(chromeSpy.spy.mock.calls[0][0]).toEqual({ jd_usage: { a: 2 } });
  });
});

// ─── forceFlushStorageQueue ───────────────────────────────────────────────────

describe("forceFlushStorageQueue", () => {
  it("resolves immediately when the queue is empty", async () => {
    await expect(forceFlushStorageQueue()).resolves.toBeUndefined();
    expect(chromeSpy.spy).not.toHaveBeenCalled();
  });

  it("flushes all pending writes immediately without waiting for debounce", async () => {
    queueStorageReplace("jd_usage", { x: 99 });
    // Timer hasn't fired — normally would wait 1 s.
    await forceFlushStorageQueue();
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    expect(chromeSpy.spy.mock.calls[0][0]).toEqual({ jd_usage: { x: 99 } });
  });

  it("returns the pending value as undefined after flushing", async () => {
    queueStorageReplace("jd_usage", { x: 1 });
    await forceFlushStorageQueue();
    expect(readThrough("jd_usage")).toBeUndefined();
  });

  it("concurrent forceFlushStorageQueue calls coalesce into one flush", async () => {
    queueStorageReplace("jd_usage", { a: 1 });
    queueStorageReplace("jd_temptations", { b: 2 });
    // Fire two concurrent flushes.
    await Promise.all([forceFlushStorageQueue(), forceFlushStorageQueue()]);
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
  });
});

// ─── flushStorageQueue ────────────────────────────────────────────────────────

describe("flushStorageQueue", () => {
  it("resolves immediately when the queue is empty", async () => {
    await expect(flushStorageQueue()).resolves.toBeUndefined();
    expect(chromeSpy.spy).not.toHaveBeenCalled();
  });

  it("flushes pending writes and clears the cache", async () => {
    queueStorageReplace("jd_usage", { m: 5 });
    await flushStorageQueue();
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    expect(readThrough("jd_usage")).toBeUndefined();
  });
});

// ─── Failure recovery ─────────────────────────────────────────────────────────

describe("failure recovery", () => {
  it("restores pending writes when chrome.storage.local.set fails", async () => {
    // Make chrome.storage.local.set fail by setting lastError.
    chromeSpy.spy.mockImplementationOnce((_items: unknown, callback: () => void) => {
      (chrome.runtime as { lastError: unknown }).lastError = new Error("quota exceeded");
      callback();
      (chrome.runtime as { lastError: unknown }).lastError = undefined;
    });

    queueStorageReplace("jd_usage", { a: 99 });
    await forceFlushStorageQueue().catch(() => {});

    // The value should still be readable (restored to queue).
    expect(readThrough("jd_usage")).toEqual({ a: 99 });
  });

  it("does not restore keys that were overwritten during a failed flush", async () => {
    // Make the first set call fail.
    let failNext = true;
    chromeSpy.spy.mockImplementation((_items: unknown, callback: () => void) => {
      if (failNext) {
        (chrome.runtime as { lastError: unknown }).lastError = new Error("fail");
        callback();
        (chrome.runtime as { lastError: unknown }).lastError = undefined;
        failNext = false;
      } else {
        callback();
      }
    });

    queueStorageReplace("jd_usage", { a: 1 });
    // Start the flush (will fail).
    const flushPromise = forceFlushStorageQueue().catch(() => {});

    // While flush is in-flight, enqueue a newer value.
    queueStorageReplace("jd_usage", { a: 2 });

    await flushPromise;

    // The newer value (a: 2) should win — not restored from the failed snapshot.
    expect(readThrough("jd_usage")).toEqual({ a: 2 });
  });
});

// ─── Performance ─────────────────────────────────────────────────────────────

describe("performance", () => {
  it("100 rapid writes to different keys produce exactly 1 set call", async () => {
    for (let i = 0; i < 100; i++) {
      queueStorageReplace(`key_${i}`, { i });
    }
    await forceFlushStorageQueue();
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    const written = chromeSpy.spy.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(written)).toHaveLength(100);
  });

  it("100 rapid writes to the same key produce exactly 1 set call", async () => {
    for (let i = 0; i < 100; i++) {
      queueStorageReplace("jd_usage", { i });
    }
    await forceFlushStorageQueue();
    expect(chromeSpy.spy).toHaveBeenCalledTimes(1);
    expect(chromeSpy.spy.mock.calls[0][0]).toEqual({ jd_usage: { i: 99 } });
  });
});
