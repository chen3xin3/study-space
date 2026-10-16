import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import type { FocusAnalytics } from "../statistics.model";
import { FocusRecords } from "./FocusRecords";
import { FocusTimeDistribution } from "./FocusTimeDistribution";
import { StatisticsOverview } from "./StatisticsOverview";
import { StudyTrendChart } from "./StudyTrendChart";
import { SubjectDonutChart } from "./SubjectDonutChart";

const analytics: FocusAnalytics = {
  allTime: { sessions: 9, seconds: 9000, activeDays: 3, averageSeconds: 3000 },
  selected: { sessions: 9, seconds: 9000, activeDays: 3, averageSeconds: 3000 },
  subjects: [{ subject: "english", sessions: 9, seconds: 9000, percent: 100 }],
  trend: [{ localDate: "2026-10-03", seconds: 1500, sessions: 1 }],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: hour === 8 ? 1500 : 0, sessions: hour === 8 ? 1 : 0 })),
  records: Array.from({ length: 9 }, (_, index) => ({ timerId: String(index + 1), startedAt: `2026-10-03T08:${String(index).padStart(2, "0")}:00+08:00`, endedAt: `2026-10-03T08:${String(index + 1).padStart(2, "0")}:00+08:00`, studySeconds: 1500, mode: "pomodoro" as const, subject: "english" as const, goal: `目标 ${index + 1}`, learningItemId: null, dailyTaskId: null })),
};

it("renders readable summaries alongside every chart", () => {
  render(<><StatisticsOverview analytics={analytics} /><SubjectDonutChart subjects={analytics.subjects} totalSeconds={analytics.selected.seconds} /><StudyTrendChart points={analytics.trend} /><FocusTimeDistribution points={analytics.hourly} /></>);
  expect(screen.getByText("累计专注")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "科目专注占比" })).toHaveTextContent("英语");
  expect(screen.getByRole("region", { name: "学习时长趋势" })).toHaveTextContent("25 分钟");
  expect(screen.getByRole("region", { name: "专注时段分布" })).toHaveTextContent("08:00");
});

it("expands focus records after the first eight", async () => {
  const user = userEvent.setup(); render(<FocusRecords records={analytics.records} />);
  expect(screen.queryByText("目标 9")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "查看全部记录" }));
  expect(screen.getByText("目标 9")).toBeInTheDocument();
});
