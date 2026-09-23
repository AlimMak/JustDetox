import type { TemptationMap, UsageMap } from "../../../core/types";

export function currentUsage(usage: UsageMap, intervalHours: number, now: number): UsageMap {
  const intervalMs = intervalHours * 3_600_000;
  return Object.fromEntries(Object.entries(usage).filter(([, record]) =>
    record.windowStartTs > 0 && now - record.windowStartTs < intervalMs,
  ));
}

export function currentTemptations(temptations: TemptationMap, intervalHours: number, now: number): TemptationMap {
  const intervalMs = intervalHours * 3_600_000;
  return Object.fromEntries(Object.entries(temptations).filter(([, record]) =>
    record.windowStartTs > 0 && now - record.windowStartTs < intervalMs,
  ));
}

/** The dashboard total includes every current record, even though its chart shows only top sites. */
export function sumTrackedSeconds(usage: UsageMap): number {
  return Object.values(usage).reduce((sum, record) => sum + record.activeSeconds, 0);
}
