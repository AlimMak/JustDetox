/**
 * JustDetox — Schedule evaluation helpers.
 *
 * Pure functions for checking whether a ScheduleWindow (or a set of windows)
 * is currently active, and for formatting a schedule summary for display.
 *
 * All functions accept an explicit `now: Date` parameter for testability.
 * In production, callers pass `new Date()`.
 */

import type { ScheduleWindow } from "./types";

// ─── Active-window check ──────────────────────────────────────────────────────

/**
 * Returns `true` when the given schedule window is currently active.
 *
 * Handles two cases:
 *
 * **Normal window** (`endMinutes > startMinutes`):
 *   The window is active when:
 *     - `now.getDay()` is in `days`, AND
 *     - `currentMinutes >= startMinutes && currentMinutes < endMinutes`
 *
 * **Overnight window** (`endMinutes < startMinutes`, e.g. 22:00–02:00):
 *   The window spans midnight. Two sub-cases:
 *     - Evening side: today is in `days` AND `currentMinutes >= startMinutes`
 *     - Morning side: yesterday is in `days` AND `currentMinutes < endMinutes`
 *
 * A disabled schedule or one with no days configured is never active.
 */
export function isScheduleActive(schedule: ScheduleWindow, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (schedule.days.length === 0) return false;
  // Zero-duration window (start === end) is treated as never active.
  if (schedule.startMinutes === schedule.endMinutes) return false;

  const day = now.getDay(); // 0 = Sunday … 6 = Saturday
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { startMinutes, endMinutes, days } = schedule;

  if (endMinutes > startMinutes) {
    // Normal same-day window.
    return days.includes(day) && minutes >= startMinutes && minutes < endMinutes;
  }

  // Overnight window: crosses midnight.
  // Evening side: today is a scheduled day and we're past the start time.
  if (days.includes(day) && minutes >= startMinutes) return true;
  // Morning side: yesterday is a scheduled day and we're before the end time.
  const yesterday = (day + 6) % 7;
  if (days.includes(yesterday) && minutes < endMinutes) return true;

  return false;
}

/**
 * Returns `true` when ANY of the given schedule windows is currently active.
 *
 * - **Empty array:** treated as "always active" (no schedule = rule applies all the time).
 * - **One or more windows:** OR logic — if any enabled window matches, returns `true`.
 * - Disabled windows are skipped.
 */
export function isAnyScheduleActive(schedules: ScheduleWindow[], now: Date): boolean {
  // No schedule configured → always active.
  if (schedules.length === 0) return true;
  return schedules.some((s) => isScheduleActive(s, now));
}

// ─── Display formatting ───────────────────────────────────────────────────────

const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Convert minutes-since-midnight to a 12-hour display string, e.g. "9:00 AM". */
function minutesToDisplay(m: number): string {
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const padded = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  return `${h12}${padded === "" ? ":00" : padded} ${period}`;
}

/**
 * Produce a short human-readable label for the set of days.
 *
 * Special labels:
 *   All 7 days        → "Daily"
 *   Mon–Fri (1–5)     → "Weekdays"
 *   Sat + Sun (0, 6)  → "Weekends"
 *   Anything else     → abbreviated names joined by ", "
 */
function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Daily";
  if (sorted.length === 5 && sorted.every((d, i) => d === [1, 2, 3, 4, 5][i])) return "Weekdays";
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return "Weekends";
  return sorted.map((d) => DAY_ABBREVS[d]).join(", ");
}

/**
 * Format a single `ScheduleWindow` for display.
 *
 * Output: `"{days label}, {startTime}–{endTime}"`
 *
 * Examples:
 *   - "Weekdays, 9:00 AM–5:00 PM"
 *   - "Daily, 10:00 PM–2:00 AM"
 *   - "Mon, Wed, Fri, 9:00 AM–12:00 PM"
 */
export function formatScheduleSummary(schedule: ScheduleWindow): string {
  const daysLabel = formatDays(schedule.days);
  const start = minutesToDisplay(schedule.startMinutes);
  const end = minutesToDisplay(schedule.endMinutes);
  return `${daysLabel}, ${start}–${end}`;
}
