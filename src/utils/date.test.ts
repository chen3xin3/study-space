import { calculateCountdown, formatLocalDate, formatLocalTime, isValidExamDate } from "./date";

describe("date utilities", () => {
  const now = new Date(2026, 8, 24, 9, 41, 28);

  it("distinguishes unset, future, current and passed exam dates", () => {
    expect(calculateCountdown("", now)).toEqual({ status: "unset" });
    expect(calculateCountdown("2026-09-26", now)).toEqual({ status: "upcoming", days: 2 });
    expect(calculateCountdown("2026-09-24", now)).toEqual({ status: "today", days: 0 });
    expect(calculateCountdown("2026-09-20", now)).toEqual({ status: "passed", days: 4 });
  });

  it("rejects calendar dates that only look valid", () => {
    expect(isValidExamDate("2026-02-28")).toBe(true);
    expect(isValidExamDate("2026-02-31")).toBe(false);
    expect(calculateCountdown("2026-02-31", now)).toEqual({ status: "invalid" });
  });

  it("formats local date and time for the dashboard", () => {
    expect(formatLocalTime(now)).toBe("09:41:28");
    expect(formatLocalDate(now)).toContain("2026年9月24日");
  });
});
