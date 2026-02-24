import { describe, it, expect } from "vitest";
import { formatTime } from "../utils/formatTime";

describe("formatTime", () => {
  it("returns '0s' for 0 seconds", () => {
    expect(formatTime(0)).toBe("0s");
  });

  it("returns seconds only for sub-minute values", () => {
    expect(formatTime(1)).toBe("1s");
    expect(formatTime(45)).toBe("45s");
    expect(formatTime(59)).toBe("59s");
  });

  it("shows minutes and seconds for 1-59 minutes", () => {
    expect(formatTime(60)).toBe("1m 0s");
    expect(formatTime(90)).toBe("1m 30s");
    expect(formatTime(3599)).toBe("59m 59s");
  });

  it("shows hours and minutes when >= 1 hour (drops seconds)", () => {
    expect(formatTime(3600)).toBe("1h 0m");
    expect(formatTime(3661)).toBe("1h 1m");
    expect(formatTime(7200)).toBe("2h 0m");
    expect(formatTime(7384)).toBe("2h 3m");
  });

  it("handles large values correctly", () => {
    // 24 hours
    expect(formatTime(86400)).toBe("24h 0m");
    // 1h 59m 59s → drops seconds
    expect(formatTime(7199)).toBe("1h 59m");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(1.9)).toBe("1s");
    expect(formatTime(61.7)).toBe("1m 1s");
  });

  it("clamps negative values to 0", () => {
    expect(formatTime(-1)).toBe("0s");
    expect(formatTime(-3600)).toBe("0s");
  });
});
