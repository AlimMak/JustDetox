/**
 * JustDetox — Self-Control Graph logic.
 *
 * Records timestamped temptation events and provides pure aggregation helpers
 * for the Self-Control Graph feature.
 *
 * Storage key: "jd_self_control" → SelfControlData
 *
 * Constraints:
 *  - Maximum 2,000 events per window (oldest dropped on overflow).
 *  - Same domain+type within DEBOUNCE_MS (3 s) counts as one event.
 *  - Window resets with the same intervalHours as usage data.
 */

import { getSelfControlData, setSelfControlData, getSettings } from "./storage";
import type { SelfControlData, SelfControlEvent, SelfControlEventType } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum events retained per window. Oldest are dropped when exceeded. */
const EVENT_CAP = 2_000;

/** Minimum gap between events with the same domain+type (milliseconds). */
const DEBOUNCE_MS = 3_000;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BucketPoint {
  /** Unix ms timestamp of the start of this bucket. */
  bucketStart: number;
  count: number;
}

export interface SpikeSummary {
  bucketStart: number;
  count: number;
}

export interface DomainSummary {
  domain: string;
  count: number;
}

// ─── Write path ───────────────────────────────────────────────────────────────

/**
 * Record a temptation event for the given domain and type.
 *
 * Skipped if:
 *  - The same domain+type was recorded within DEBOUNCE_MS.
 *
 * Resets the window if the configured intervalHours has elapsed since
 * windowStartTs, preserving a previousWindowCount for comparison.
 *
 * Caps events at EVENT_CAP (oldest dropped first).
 *
 * Safe to call fire-and-forget from the service worker.
 */
export async function recordEvent(params: {
  domain: string;
  type: SelfControlEventType;
  ts?: number;
}): Promise<void> {
  const now = params.ts ?? Date.now();
  const [data, settings] = await Promise.all([getSelfControlData(), getSettings()]);

  // Window expiry: reset the log if the window has elapsed.
  const intervalMs = settings.resetWindow.intervalHours * 3_600_000;
  const windowExpired = now - data.windowStartTs >= intervalMs;

  const baseData: SelfControlData = windowExpired
    ? {
        windowStartTs: now,
        events: [],
        previousWindowCount: data.events.length,
      }
    : data;

  // Debounce: skip if the same domain+type was recorded recently.
  // Scan backwards through the (chronologically ordered) events array.
  for (let i = baseData.events.length - 1; i >= 0; i--) {
    const e = baseData.events[i];
    if (now - e.ts >= DEBOUNCE_MS) break; // all earlier events are too old
    if (e.domain === params.domain && e.type === params.type) return;
  }

  const newEvent: SelfControlEvent = {
    ts: now,
    domain: params.domain,
    type: params.type,
  };

  // Append and enforce cap (drop oldest).
  const appended = [...baseData.events, newEvent];
  const events = appended.length > EVENT_CAP
    ? appended.slice(appended.length - EVENT_CAP)
    : appended;

  await setSelfControlData({ ...baseData, events });
}

// ─── Read / aggregation helpers (pure) ────────────────────────────────────────

/**
 * Aggregate events into fixed-size time buckets for charting.
 *
 * Buckets start on even multiples of `bucketMinutes` (e.g. :00, :15, :30, :45
 * for 15-minute buckets) so the chart aligns neatly with clock boundaries.
 *
 * Empty buckets (count = 0) are included for continuity.
 *
 * @param data          Raw SelfControlData from storage.
 * @param bucketMinutes Bucket size in minutes (5, 15, 30, or 60).
 * @returns Chronological array of { bucketStart, count }.
 */
export function getBucketedSeries(
  data: SelfControlData,
  bucketMinutes: number,
): BucketPoint[] {
  const now = Date.now();
  const bucketMs = bucketMinutes * 60_000;
  const windowStart = data.windowStartTs;

  if (now <= windowStart || data.events.length === 0) {
    // Return a single zero-count bucket for the current position.
    const currentBucket = Math.floor(now / bucketMs) * bucketMs;
    return [{ bucketStart: currentBucket, count: 0 }];
  }

  // Align to even bucket boundaries.
  const firstBucketStart = Math.floor(windowStart / bucketMs) * bucketMs;
  const lastBucketStart = Math.floor(now / bucketMs) * bucketMs;

  const buckets: BucketPoint[] = [];

  for (let start = firstBucketStart; start <= lastBucketStart; start += bucketMs) {
    const end = start + bucketMs;
    let count = 0;
    for (const e of data.events) {
      if (e.ts >= start && e.ts < end) count++;
    }
    buckets.push({ bucketStart: start, count });
  }

  return buckets;
}

/**
 * Return the top N buckets by event count, descending.
 * Buckets with count === 0 are excluded.
 */
export function getTopSpikes(buckets: BucketPoint[], n: number): SpikeSummary[] {
  return [...buckets]
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Return the top N domains by total event count, descending.
 */
export function getTopDomains(data: SelfControlData, n: number): DomainSummary[] {
  const counts: Record<string, number> = {};
  for (const e of data.events) {
    counts[e.domain] = (counts[e.domain] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
