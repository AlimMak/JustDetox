import { describe, it, expect } from "vitest";
import { isScheduleActive, isAnyScheduleActive, formatScheduleSummary } from "../schedule";
import type { ScheduleWindow } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a Date for a given day/hour/minute in the *local* timezone. */
function localDate(dayOfWeek: number, hour: number, minute: number): Date {
  // Start from a known epoch and walk forward to the right day-of-week.
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  // Shift to the desired day of the week (0=Sun…6=Sat).
  const diff = dayOfWeek - d.getDay();
  d.setDate(d.getDate() + diff);
  return d;
}

function makeWindow(
  days: number[],
  startMinutes: number,
  endMinutes: number,
  enabled = true,
): ScheduleWindow {
  return { enabled, days, startMinutes, endMinutes };
}

// ─── isScheduleActive ─────────────────────────────────────────────────────────

describe("isScheduleActive", () => {
  // ── Normal (same-day) windows ──────────────────────────────────────────────

  describe("normal same-day window", () => {
    // Mon–Fri 9:00–17:00 (540–1020)
    const weekday9to17 = makeWindow([1, 2, 3, 4, 5], 540, 1020);

    it("is active on Monday at 10:00", () => {
      expect(isScheduleActive(weekday9to17, localDate(1, 10, 0))).toBe(true);
    });

    it("is active at the exact start time", () => {
      expect(isScheduleActive(weekday9to17, localDate(3, 9, 0))).toBe(true);
    });

    it("is NOT active at the exact end time (exclusive end)", () => {
      expect(isScheduleActive(weekday9to17, localDate(3, 17, 0))).toBe(false);
    });

    it("is NOT active on Saturday at 10:00", () => {
      expect(isScheduleActive(weekday9to17, localDate(6, 10, 0))).toBe(false);
    });

    it("is NOT active on Sunday at 10:00", () => {
      expect(isScheduleActive(weekday9to17, localDate(0, 10, 0))).toBe(false);
    });

    it("is NOT active on a weekday before start time", () => {
      expect(isScheduleActive(weekday9to17, localDate(2, 8, 59))).toBe(false);
    });

    it("is NOT active on a weekday after end time", () => {
      expect(isScheduleActive(weekday9to17, localDate(4, 17, 1))).toBe(false);
    });

    it("is active on Friday at 16:59", () => {
      expect(isScheduleActive(weekday9to17, localDate(5, 16, 59))).toBe(true);
    });
  });

  // ── Overnight (cross-midnight) windows ────────────────────────────────────

  describe("overnight window (22:00–02:00, daily)", () => {
    const overnight = makeWindow([0, 1, 2, 3, 4, 5, 6], 1320, 120); // 22:00–02:00

    it("is active at 23:30 (evening side)", () => {
      expect(isScheduleActive(overnight, localDate(1, 23, 30))).toBe(true);
    });

    it("is active at 01:00 (morning side, next day)", () => {
      expect(isScheduleActive(overnight, localDate(2, 1, 0))).toBe(true);
    });

    it("is active at exactly 22:00 (start of evening)", () => {
      expect(isScheduleActive(overnight, localDate(3, 22, 0))).toBe(true);
    });

    it("is NOT active at exactly 02:00 (exclusive end)", () => {
      expect(isScheduleActive(overnight, localDate(4, 2, 0))).toBe(false);
    });

    it("is NOT active at 03:00 (past end)", () => {
      expect(isScheduleActive(overnight, localDate(1, 3, 0))).toBe(false);
    });

    it("is NOT active at noon", () => {
      expect(isScheduleActive(overnight, localDate(5, 12, 0))).toBe(false);
    });
  });

  describe("overnight window limited to specific days", () => {
    // Only Sunday night → Monday morning (Sun at 22:00 → Mon at 02:00)
    const sunNight = makeWindow([0], 1320, 120); // days=[0]=Sunday

    it("is active on Sunday at 23:00 (Sunday is in days list, evening side)", () => {
      expect(isScheduleActive(sunNight, localDate(0, 23, 0))).toBe(true);
    });

    it("is active on Monday at 01:00 (yesterday=Sunday is in days list, morning side)", () => {
      expect(isScheduleActive(sunNight, localDate(1, 1, 0))).toBe(true);
    });

    it("is NOT active on Saturday at 23:00 (Saturday not in days list)", () => {
      expect(isScheduleActive(sunNight, localDate(6, 23, 0))).toBe(false);
    });

    it("is NOT active on Tuesday at 01:00 (Monday not in days list)", () => {
      expect(isScheduleActive(sunNight, localDate(2, 1, 0))).toBe(false);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("disabled schedule is never active", () => {
      const disabled = makeWindow([1, 2, 3, 4, 5], 540, 1020, false);
      expect(isScheduleActive(disabled, localDate(1, 10, 0))).toBe(false);
    });

    it("empty days array is never active", () => {
      const nodays: ScheduleWindow = { enabled: true, days: [], startMinutes: 540, endMinutes: 1020 };
      expect(isScheduleActive(nodays, localDate(1, 10, 0))).toBe(false);
    });

    it("single day, single hour window active at midpoint", () => {
      const window = makeWindow([3], 720, 780); // Wed 12:00–13:00
      expect(isScheduleActive(window, localDate(3, 12, 30))).toBe(true);
    });

    it("single day, single hour window inactive on wrong day", () => {
      const window = makeWindow([3], 720, 780); // Wed 12:00–13:00
      expect(isScheduleActive(window, localDate(4, 12, 30))).toBe(false);
    });
  });
});

// ─── isAnyScheduleActive ──────────────────────────────────────────────────────

describe("isAnyScheduleActive", () => {
  it("returns true for an empty array (always-active rule)", () => {
    expect(isAnyScheduleActive([], new Date())).toBe(true);
  });

  it("returns true if at least one schedule is active (OR logic)", () => {
    const active = makeWindow([1, 2, 3, 4, 5], 540, 1020);
    const inactive = makeWindow([0], 540, 1020); // Sunday only
    expect(isAnyScheduleActive([inactive, active], localDate(1, 10, 0))).toBe(true);
  });

  it("returns false if all schedules are inactive", () => {
    const sun = makeWindow([0], 540, 1020);
    const sat = makeWindow([6], 540, 1020);
    expect(isAnyScheduleActive([sun, sat], localDate(2, 10, 0))).toBe(false); // Tuesday
  });

  it("returns false if the only schedule is disabled", () => {
    const disabled = makeWindow([1, 2, 3, 4, 5], 540, 1020, false);
    expect(isAnyScheduleActive([disabled], localDate(1, 10, 0))).toBe(false);
  });

  describe("multiple schedules OR logic", () => {
    // A: weekdays 9–17
    // B: weekend 14–18
    const weekday = makeWindow([1, 2, 3, 4, 5], 540, 1020);
    const weekend = makeWindow([0, 6], 840, 1080); // 14:00–18:00

    it("Monday at noon → active via weekday schedule", () => {
      expect(isAnyScheduleActive([weekday, weekend], localDate(1, 12, 0))).toBe(true);
    });

    it("Saturday at 15:00 → active via weekend schedule", () => {
      expect(isAnyScheduleActive([weekday, weekend], localDate(6, 15, 0))).toBe(true);
    });

    it("Saturday at 10:00 → inactive (neither schedule covers it)", () => {
      expect(isAnyScheduleActive([weekday, weekend], localDate(6, 10, 0))).toBe(false);
    });

    it("Sunday at 19:00 → inactive (past end of weekend schedule)", () => {
      expect(isAnyScheduleActive([weekday, weekend], localDate(0, 19, 0))).toBe(false);
    });
  });
});

// ─── formatScheduleSummary ────────────────────────────────────────────────────

describe("formatScheduleSummary", () => {
  it("all 7 days → 'Daily'", () => {
    const w = makeWindow([0, 1, 2, 3, 4, 5, 6], 540, 1020);
    expect(formatScheduleSummary(w)).toBe("Daily, 9:00 AM–5:00 PM");
  });

  it("Mon–Fri → 'Weekdays'", () => {
    const w = makeWindow([1, 2, 3, 4, 5], 540, 1020);
    expect(formatScheduleSummary(w)).toBe("Weekdays, 9:00 AM–5:00 PM");
  });

  it("Sat–Sun → 'Weekends'", () => {
    const w = makeWindow([0, 6], 840, 1080);
    expect(formatScheduleSummary(w)).toBe("Weekends, 2:00 PM–6:00 PM");
  });

  it("custom days → abbreviated list", () => {
    const w = makeWindow([1, 3, 5], 540, 720); // Mon, Wed, Fri
    expect(formatScheduleSummary(w)).toBe("Mon, Wed, Fri, 9:00 AM–12:00 PM");
  });

  it("overnight window formats correctly", () => {
    const w = makeWindow([0, 1, 2, 3, 4, 5, 6], 1320, 120); // 22:00–02:00
    expect(formatScheduleSummary(w)).toBe("Daily, 10:00 PM–2:00 AM");
  });

  it("noon time displays correctly", () => {
    const w = makeWindow([1, 2, 3, 4, 5], 720, 780); // 12:00–13:00
    expect(formatScheduleSummary(w)).toBe("Weekdays, 12:00 PM–1:00 PM");
  });

  it("midnight start time", () => {
    const w = makeWindow([1], 0, 60); // midnight to 1 AM
    expect(formatScheduleSummary(w)).toBe("Mon, 12:00 AM–1:00 AM");
  });
});
