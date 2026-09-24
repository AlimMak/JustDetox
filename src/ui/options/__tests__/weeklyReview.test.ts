import { describe, expect, it } from "vitest";
import { weeklyReview } from "../utils/weeklyReview";

describe("weekly review", () => {
  it("uses local Monday-to-Sunday weeks and counts focus time separately", () => {
    const review = weeklyReview([
      { date: "2026-09-13", activeSeconds: 60, focusSeconds: 30, blockedAttempts: 1, score: null },
      { date: "2026-09-14", activeSeconds: 300, focusSeconds: 120, blockedAttempts: 2, score: null },
      { date: "2026-09-20", activeSeconds: 90, focusSeconds: 60, blockedAttempts: 3, score: null },
      { date: "2026-09-21", activeSeconds: 45, blockedAttempts: 1, score: null },
    ], new Date(2026, 8, 20, 12));
    expect(review.current).toEqual({ focusSeconds: 180, activeSeconds: 390, blockedAttempts: 5 });
    expect(review.previous).toEqual({ focusSeconds: 30, activeSeconds: 60, blockedAttempts: 1 });
  });
});
