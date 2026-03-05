import { describe, it, expect } from "vitest";
import { computeElapsedSeconds } from "../tracker";

// ─── computeElapsedSeconds ────────────────────────────────────────────────────

describe("computeElapsedSeconds", () => {
  // ── Zero / negative delta ──────────────────────────────────────────────────

  it("returns 0 when now equals lastFlushTs", () => {
    expect(computeElapsedSeconds(1_000, 1_000)).toBe(0);
  });

  it("returns 0 when now is before lastFlushTs (clock skew)", () => {
    expect(computeElapsedSeconds(2_000, 1_000)).toBe(0);
  });

  // ── Unit conversion ────────────────────────────────────────────────────────

  it("converts milliseconds to seconds", () => {
    expect(computeElapsedSeconds(0, 30_000)).toBe(30);
  });

  it("returns fractional seconds for sub-second intervals", () => {
    expect(computeElapsedSeconds(0, 1_500)).toBe(1.5);
  });

  it("returns exactly 1 second for a 1000ms delta", () => {
    expect(computeElapsedSeconds(5_000, 6_000)).toBe(1);
  });

  // ── Default cap (90 s) ─────────────────────────────────────────────────────

  it("caps at 90s for a very large delta (laptop sleep scenario)", () => {
    expect(computeElapsedSeconds(0, 8 * 60 * 60 * 1_000)).toBe(90);
  });

  it("caps at 90s for a delta of exactly 200s", () => {
    expect(computeElapsedSeconds(0, 200_000)).toBe(90);
  });

  it("does not cap when delta is exactly 90s", () => {
    expect(computeElapsedSeconds(0, 90_000)).toBe(90);
  });

  it("does not cap when delta is just under 90s", () => {
    expect(computeElapsedSeconds(0, 89_999)).toBeCloseTo(89.999, 2);
  });

  // ── Typical usage ─────────────────────────────────────────────────────────

  it("handles a typical 1-minute alarm tick (60s delta)", () => {
    expect(computeElapsedSeconds(1_000, 61_000)).toBe(60);
  });

  it("handles a 45-second partial alarm interval", () => {
    expect(computeElapsedSeconds(1_000, 46_000)).toBe(45);
  });

  // ── Custom cap ────────────────────────────────────────────────────────────

  it("respects a custom cap smaller than the elapsed time", () => {
    expect(computeElapsedSeconds(0, 60_000, 30_000)).toBe(30);
  });

  it("does not cap when elapsed is below the custom cap", () => {
    expect(computeElapsedSeconds(0, 10_000, 30_000)).toBe(10);
  });

  it("handles a custom cap of 0 (always returns 0)", () => {
    expect(computeElapsedSeconds(0, 60_000, 0)).toBe(0);
  });
});
