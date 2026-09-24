import { localDateKey } from "../../../core/history";
import type { DailyProgress } from "../../../core/types";

export interface WeekTotals {
  focusSeconds: number;
  activeSeconds: number;
  blockedAttempts: number;
}

function startOfWeek(today: Date): Date {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function sumWeek(history: DailyProgress[], start: Date): WeekTotals {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const first = localDateKey(start);
  const afterLast = localDateKey(end);
  return history
    .filter((day) => day.date >= first && day.date < afterLast)
    .reduce((totals, day) => ({
      focusSeconds: totals.focusSeconds + (day.focusSeconds ?? 0),
      activeSeconds: totals.activeSeconds + day.activeSeconds,
      blockedAttempts: totals.blockedAttempts + day.blockedAttempts,
    }), { focusSeconds: 0, activeSeconds: 0, blockedAttempts: 0 });
}

export function weeklyReview(history: DailyProgress[], today = new Date()) {
  const start = startOfWeek(today);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - 7);
  return {
    current: sumWeek(history, start),
    previous: sumWeek(history, previousStart),
  };
}
