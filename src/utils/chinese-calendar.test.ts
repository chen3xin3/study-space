import { describe, expect, it } from "vitest";
import { getChineseCalendarInfo } from "./chinese-calendar";

describe("getChineseCalendarInfo", () => {
  it("returns Mid-Autumn lunar metadata for 2026-09-25", () => {
    expect(getChineseCalendarInfo("2026-09-25")).toMatchObject({
      lunarMonth: "八月",
      lunarDay: "十五",
      lunarShort: "十五",
      festival: "中秋节",
    });
  });

  it("returns the autumn equinox solar term", () => {
    expect(getChineseCalendarInfo("2026-09-23")?.solarTerm).toBe("秋分");
  });

  it("uses the lunar month on its first day", () => {
    expect(getChineseCalendarInfo("2026-09-11")?.lunarShort).toBe("八月");
  });

  it("returns null instead of crashing for an invalid local date", () => {
    expect(getChineseCalendarInfo("2026-02-31")).toBeNull();
    expect(getChineseCalendarInfo("not-a-date")).toBeNull();
  });
});
