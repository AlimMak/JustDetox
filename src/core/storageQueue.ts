/**
 * JustDetox — Centralized write queue for chrome.storage.local.
 *
 * # Problem
 * Multiple modules (tracker, temptation, dopamine, selfControl) write to
 * chrome.storage.local independently. A single blocked navigation can trigger
 * up to 5 separate chrome.storage.local.set calls. Chrome throttles storage
 * writes, and excessive writes cause dropped state and poor performance.
 *
 * # Solution — write-back cache
 * High-frequency writes go to a `pendingWrites` Map first. Flushes are
 * debounced; a single chrome.storage.local.set drains all pending keys
 * atomically. Between enqueue and flush, data lives in the write-back cache
 * and is returned by `readThrough()` so reads never observe stale values.
 *
 * # Which writes are batched?
 * Queued  : setUsage, setTemptations, setDopamineScore, setSelfControlData
 * Immediate: setSettings (critical — must persist before the next CHECK_URL)
 *
 * # Force-flush points
 * Call `forceFlushStorageQueue()` at critical boundaries:
 *   - SW onSuspend (before the worker is killed)
 *   - exportAll (before reading — ensures writes are in chrome.storage)
 *   - importAll (before writing — drains stale queue; after writing — persists import)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Milliseconds of inactivity before an automatic flush fires.
 * Short enough to limit data-loss on SW crash; long enough to batch
 * rapid bursts of writes into a single chrome.storage.local.set call.
 */
const DEBOUNCE_MS = 1_000;

// ─── Module state ─────────────────────────────────────────────────────────────

/**
 * Write-back cache: maps storage key → latest value pending a flush.
 *
 * Serves double duty:
 *  1. Tracks which keys have unflushed writes (for the debounced flush).
 *  2. Acts as a read-through cache so callers always see the latest value,
 *     even before it has been committed to chrome.storage.local.
 */
const pendingWrites = new Map<string, unknown>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * When a flush is in progress, holds its promise so that concurrent
 * `flushStorageQueue()` calls share the same flush rather than stacking.
 */
let flushInProgress: Promise<void> | null = null;

// ─── Debug counters (dev only) ────────────────────────────────────────────────

const _stats = {
  /** Total calls to queueStorageReplace. */
  enqueued: 0,
  /** Total doFlush() invocations that reached chrome.storage. */
  flushes: 0,
  /** Redundant writes coalesced into fewer set() calls. */
  setCallsSaved: 0,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function rawSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

function scheduleFlush(): void {
  if (debounceTimer !== null) return; // already scheduled
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void doFlush();
  }, DEBOUNCE_MS);
}

function _restoreSnapshot(snapshot: Record<string, unknown>): void {
  // Only restore keys not overwritten by a newer write that arrived
  // after the snapshot was taken (i.e. after we cleared pendingWrites).
  for (const [k, v] of Object.entries(snapshot)) {
    if (!pendingWrites.has(k)) pendingWrites.set(k, v);
  }
}

async function doFlush(): Promise<void> {
  if (pendingWrites.size === 0) return;

  // Snapshot and clear the cache BEFORE the async write.
  // Writes that arrive during the flush go into a fresh queue entry and
  // are picked up by the next scheduled flush.
  const snapshot = Object.fromEntries(pendingWrites);
  pendingWrites.clear();

  if (import.meta.env.DEV) {
    const keyCount = Object.keys(snapshot).length;
    const start = performance.now();
    try {
      await rawSet(snapshot);
      _stats.flushes++;
      // eslint-disable-next-line no-console
      console.debug(
        `[JustDetox queue] flush #${_stats.flushes}: ${keyCount} key(s) in ` +
          `${(performance.now() - start).toFixed(1)}ms ` +
          `(${_stats.setCallsSaved} writes coalesced so far)`,
      );
    } catch (err) {
      _restoreSnapshot(snapshot);
      // eslint-disable-next-line no-console
      console.error("[JustDetox queue] flush failed — retaining data:", err);
    }
  } else {
    try {
      await rawSet(snapshot);
    } catch (err) {
      _restoreSnapshot(snapshot);
      // eslint-disable-next-line no-console
      console.error("[JustDetox queue] flush failed:", err);
    }
  }

  // If new writes arrived during the flush, schedule another pass.
  if (pendingWrites.size > 0) scheduleFlush();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Queue a full-object write to `key` and update the write-back cache.
 *
 * - The value is immediately available via `readThrough(key)`.
 * - If the key already has a pending write it is replaced (last-writer-wins).
 * - Multiple calls for the same key within the debounce window produce
 *   exactly one chrome.storage.local.set call.
 */
export function queueStorageReplace(key: string, value: unknown): void {
  if (pendingWrites.has(key)) _stats.setCallsSaved++;
  pendingWrites.set(key, value);
  if (import.meta.env.DEV) _stats.enqueued++;
  scheduleFlush();
}

/**
 * Read the write-back cache for `key`.
 *
 * Returns the pending (not-yet-flushed) value if present, or `undefined`
 * if no write is queued. Storage getters check this before hitting
 * chrome.storage.local to avoid read-after-write staleness.
 *
 * @example
 *   queueStorageReplace("jd_usage", updatedMap);
 *   readThrough("jd_usage");  // → updatedMap  (not stale storage value)
 */
export function readThrough(key: string): unknown {
  return pendingWrites.get(key);
}

/**
 * Flush the queue now (if not already flushing).
 *
 * If a flush is already in progress, returns the same promise (coalesced).
 * For a strict "all data is persisted" guarantee, use `forceFlushStorageQueue`.
 */
export async function flushStorageQueue(): Promise<void> {
  if (flushInProgress !== null) return flushInProgress;
  if (pendingWrites.size === 0) return;
  flushInProgress = doFlush().finally(() => {
    flushInProgress = null;
  });
  return flushInProgress;
}

/**
 * Cancel the debounce timer, wait for any in-progress flush, then flush
 * all remaining items.
 *
 * Resolves only after all pending writes have reached chrome.storage.local
 * (barring a storage error, in which case items are kept for the next flush).
 *
 * Call this at critical state boundaries:
 *  - SW onSuspend — last chance before the worker is killed.
 *  - exportAll — before reading, so the export reflects all pending writes.
 *  - importAll — before writing (drain stale queue) and after (persist import data).
 */
export async function forceFlushStorageQueue(): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Wait for an in-progress flush before starting a new one.
  if (flushInProgress !== null) {
    await flushInProgress.catch(() => {});
  }

  if (pendingWrites.size > 0) {
    await doFlush();
  }
}

/**
 * Returns a snapshot of the debug counters.
 * All values are 0 in production (dead code eliminated by Vite).
 */
export function getQueueStats(): typeof _stats {
  return { ..._stats };
}

/**
 * Reset all queue state.
 *
 * @internal For use in unit tests only — do NOT call from production code.
 */
export function _resetQueueForTesting(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingWrites.clear();
  flushInProgress = null;
  _stats.enqueued = 0;
  _stats.flushes = 0;
  _stats.setCallsSaved = 0;
}
