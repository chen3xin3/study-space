import { expect, it } from "vitest";
import type { FocusHistoryItem } from "../../services/focus/focus.types";
import { createFocusAnalytics, createStatisticsRange, createStatisticsReport, createStatisticsShareText, moveStatisticsRange } from "./statistics.model";

const focusHistory: FocusHistoryItem[] = [
  { timerId: "1", startedAt: "2026-10-01T08:00:00+08:00", endedAt: "2026-10-01T08:25:00+08:00", studySeconds: 1500, mode: "pomodoro", subject: "english", goal: "阅读", learningItemId: null, dailyTaskId: null },
  { timerId: "2", startedAt: "2026-10-01T20:00:00+08:00", endedAt: "2026-10-01T20:50:00+08:00", studySeconds: 3000, mode: "pomodoro", subject: "math", goal: "高数", learningItemId: null, dailyTaskId: null },
  { timerId: "3", startedAt: "2026-10-03T14:00:00+08:00", endedAt: "2026-10-03T14:30:00+08:00", studySeconds: 1800, mode: "open", subject: "english", goal: "翻译", learningItemId: null, dailyTaskId: null },
];

it("builds complete all-time and selected-range focus analytics", () => {
  const range = createStatisticsRange("week", new Date(2026, 9, 3, 12));
  const report = createFocusAnalytics(focusHistory, range);

  expect(report.allTime).toEqual({ sessions: 3, seconds: 6300, activeDays: 2, averageSeconds: 3150 });
  expect(report.selected.sessions).toBe(3);
  expect(report.subjects[0]).toMatchObject({ subject: "english", sessions: 2, seconds: 3300 });
  expect(report.hourly.find((item) => item.hour === 8)?.seconds).toBe(1500);
  expect(report.trend).toHaveLength(7);
  expect(report.trend.find((item) => item.localDate === "2026-10-03")?.seconds).toBe(1800);
});

it("supports day month and inclusive custom ranges", () => {
  const day = createFocusAnalytics(focusHistory, createStatisticsRange("day", new Date(2026, 9, 3, 12)));
  expect(day.records.map((item) => item.timerId)).toEqual(["3"]);

  const month = createFocusAnalytics(focusHistory, createStatisticsRange("month", new Date(2026, 9, 1, 12)));
  expect(month.selected.seconds).toBe(6300);

  const customRange = createStatisticsRange("custom", new Date(2026, 9, 2, 12), new Date(2026, 9, 1), new Date(2026, 9, 3));
  const custom = createFocusAnalytics(focusHistory, customRange);
  expect(custom.selected.sessions).toBe(3);
});

it("moves calendar periods and creates a readable share summary", () => {
  expect(moveStatisticsRange("month", new Date(2026, 9, 3), -1).getMonth()).toBe(8);
  const range = createStatisticsRange("day", new Date(2026, 9, 3));
  const text = createStatisticsShareText(createFocusAnalytics(focusHistory, range), range);
  expect(text).toContain("2026年10月3日");
  expect(text).toContain("30 分钟");
});

it("derives explicit-period totals and recent subject distribution", () => {
  const report = createStatisticsReport({
    summary: {
      tasks: [], completedTasks: 3, totalTasks: 4, todaySeconds: 1800, timer: null, streakDays: 6,
      trend: [{ localDate: "2026-10-01", seconds: 1200 }, { localDate: "2026-10-02", seconds: 1800 }],
    },
    month: [
      { localDate: "2026-10-01", totalTasks: 2, completedTasks: 1, studySeconds: 1200 },
      { localDate: "2026-09-30", totalTasks: 9, completedTasks: 9, studySeconds: 9999 },
    ],
    history: [
      { timerId: "1", startedAt: "2026-10-01T00:00:00Z", endedAt: "2026-10-01T00:25:00Z", studySeconds: 1500, mode: "pomodoro", subject: "english", goal: "阅读", learningItemId: null, dailyTaskId: null },
      { timerId: "2", startedAt: "2026-10-02T00:00:00Z", endedAt: "2026-10-02T00:50:00Z", studySeconds: 3000, mode: "pomodoro", subject: "math", goal: "高数", learningItemId: null, dailyTaskId: null },
    ],
    year: 2026,
    monthIndex: 9,
  });

  expect(report.todayTaskPercent).toBe(75);
  expect(report.sevenDaySeconds).toBe(3000);
  expect(report.monthSeconds).toBe(1200);
  expect(report.monthTotalTasks).toBe(2);
  expect(report.subjects[0]).toEqual({ subject: "math", seconds: 3000, sessions: 1 });
});

it("reports zero percent when today has no tasks", () => {
  const report = createStatisticsReport({
    summary: { tasks: [], completedTasks: 0, totalTasks: 0, todaySeconds: 0, timer: null, streakDays: 0, trend: [] },
    month: [], history: [], year: 2026, monthIndex: 9,
  });
  expect(report.todayTaskPercent).toBe(0);
  expect(report.subjects).toEqual([]);
});
