import { describe, expect, it } from "vitest";
import { presentCalendarDay } from "./calendar-day-presentation";

const base = {
  localDate: "2026-09-25",
  month: 9,
  day: 25,
  inCurrentMonth: true,
  isToday: false,
  isSelected: false,
  isExam: false,
  isWeekend: false,
  holidayName: "中秋节",
  holidayKind: "holiday" as const,
  lunar: {
    lunarFull: "农历二〇二六年八月十五",
    lunarMonth: "八月",
    lunarDay: "十五",
    lunarShort: "十五",
    festival: "中秋节",
    solarTerm: "",
  },
  totalTasks: 3,
  completedTasks: 2,
  studySeconds: 3600,
};

describe("presentCalendarDay", () => {
  it("prefers a named official holiday over other labels", () => {
    expect(presentCalendarDay(base).secondaryLabel).toBe("中秋节");
  });

  it("prefers a solar term when no festival or holiday exists", () => {
    expect(presentCalendarDay({ ...base, holidayName: "", holidayKind: null, lunar: { ...base.lunar, festival: "", solarTerm: "秋分" } }).secondaryLabel).toBe("秋分");
  });

  it("falls back to the short lunar date", () => {
    expect(presentCalendarDay({ ...base, holidayName: "", holidayKind: null, lunar: { ...base.lunar, festival: "", solarTerm: "", lunarShort: "十八" } }).secondaryLabel).toBe("十八");
  });

  it("formats partial, complete, empty, and outside-month tasks", () => {
    expect(presentCalendarDay(base).taskProgress).toBe("2/3");
    expect(presentCalendarDay({ ...base, completedTasks: 3 }).taskProgress).toBe("完成");
    expect(presentCalendarDay({ ...base, totalTasks: 0, completedTasks: 0 }).taskProgress).toBe("");
    expect(presentCalendarDay({ ...base, inCurrentMonth: false }).secondaryLabel).toBe("");
  });

  it("builds a complete accessible label", () => {
    const label = presentCalendarDay(base).accessibleLabel;
    expect(label).toContain("9月25日");
    expect(label).toContain("农历二〇二六年八月十五");
    expect(label).toContain("待办完成2项，共3项");
    expect(label).toContain("学习60分钟");
  });
});
