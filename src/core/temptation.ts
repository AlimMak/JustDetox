/**
 * JustDetox — Temptation analytics.
 *
 * Tracks how often a user attempts to access blocked sites, providing
 * insight into distraction habits without notifications or gamification.
 *
 * A "temptation attempt" is counted when any blocking overlay is triggered:
 *  - Hard-block rule overlay
 *  - Time-limit-exceeded overlay
 *  - Locked In Mode block overlay
 *
 * Debounce: multiple triggers within DEBOUNCE_MS (3 s) count as one.
 * This prevents rapid reload attempts from inflating the count.
 *
 * Window reset: counts are tied to the same reset window as usage data.
 * When the window expires, the record is zeroed before the new attempt
 * is counted.
 */

import { getTemptations, setTemptations, getSettings } from "./storage";
import type { TemptationMap, TemptationRecord } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum gap between recorded attempts per domain (milliseconds). */
const DEBOUNCE_MS = 3_000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a blocked-overlay trigger for `domain`.
 *
 * Increments the attempt counter unless:
 *  - The last attempt for this domain was within DEBOUNCE_MS.
 *  - The call is concurrent with another in-flight write (no lock needed;
 *    the service worker processes messages serially).
 *
 * @param domain     Sanitized hostname (e.g. "twitter.com").
 * @param isLockedIn True when the block was caused by Locked In Mode.
 */
export async function incrementAttempt(domain: string, isLockedIn = false): Promise<void> {
  const now = Date.now();
  const [map, settings] = await Promise.all([getTemptations(), getSettings()]);

  const existing = map[domain];

  // Debounce: skip if we just recorded an attempt for this domain.
  if (existing && now - existing.lastAttemptTs < DEBOUNCE_MS) return;

  // Check whether the tracking window has expired for this domain.
  const intervalMs = settings.resetWindow.intervalHours * 3_600_000;
  const windowExpired = existing !== undefined && now - existing.windowStartTs >= intervalMs;

  const base: TemptationRecord =
    !existing || windowExpired
      ? { attempts: 0, lastAttemptTs: 0, lockedInAttempts: 0, windowStartTs: now }
      : existing;

  const updated: TemptationMap = {
    ...map,
    [domain]: {
      ...base,
      attempts: base.attempts + 1,
      lockedInAttempts: base.lockedInAttempts + (isLockedIn ? 1 : 0),
      lastAttemptTs: now,
    },
  };

  await setTemptations(updated);
}

/**
 * Return the full temptation map for the current window.
 *
 * Callers should use this for read-only display purposes.
 */
export async function getTemptationStats(): Promise<TemptationMap> {
  return getTemptations();
}
