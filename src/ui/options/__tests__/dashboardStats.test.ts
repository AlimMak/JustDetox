import { describe, expect, it } from "vitest";
import type { UsageMap } from "../../../core/types";
import { currentUsage, sumTrackedSeconds } from "../utils/dashboardStats";

describe("dashboard usage total", () => {
  it("includes all current domains even when the chart shows only ten", () => {
    const now = 2_000_000_000;
    const usage: UsageMap = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `site${index}.example`,
      { activeSeconds: 60, lastUpdated: now, windowStartTs: now - 1000 },
    ]));
    usage["expired.example"] = { activeSeconds: 999, lastUpdated: now - 86_400_000, windowStartTs: now - 86_400_000 };

    expect(sumTrackedSeconds(currentUsage(usage, 24, now))).toBe(720);
  });
});
