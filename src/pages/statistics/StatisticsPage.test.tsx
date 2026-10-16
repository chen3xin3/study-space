import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import type { FocusService } from "../../services/focus/focus.types";
import { StatisticsPage } from "./StatisticsPage";

function dashboardService(): DashboardService {
  return {
    getSummary: vi.fn().mockResolvedValue({
      tasks: [], completedTasks: 3, totalTasks: 4, todaySeconds: 5400, timer: null, streakDays: 6,
      trend: [{ localDate: "2026-10-01", seconds: 1800 }, { localDate: "2026-10-02", seconds: 3600 }],
    }),
    getCalendarMonth: vi.fn().mockResolvedValue([{ localDate: "2026-10-01", totalTasks: 2, completedTasks: 1, studySeconds: 1800 }]),
    createTask: vi.fn(), setTaskCompleted: vi.fn(), deleteTask: vi.fn(), startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), endTimer: vi.fn(),
  } as unknown as DashboardService;
}

function focusService(): FocusService {
  return {
    start: vi.fn(), getActive: vi.fn(), setPhase: vi.fn(),
    listHistory: vi.fn().mockResolvedValue([
      { timerId: "1", startedAt: "2026-10-02T01:00:00Z", endedAt: "2026-10-02T01:25:00Z", studySeconds: 1500, mode: "pomodoro", subject: "english", goal: "阅读" },
    ]),
  } as unknown as FocusService;
}

it("renders a complete focus analytics dashboard", async () => {
  render(<MemoryRouter><StatisticsPage dashboardService={dashboardService()} focusService={focusService()} now={new Date(2026, 9, 2, 12)} /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "学习统计" })).toBeInTheDocument();
  expect(screen.getByText("累计专注")).toBeInTheDocument();
  expect(screen.getByRole("tablist", { name: "统计时间范围" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "科目专注占比" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "学习时长趋势" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "专注时段分布" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "专注记录" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "学习轨迹" })).toBeInTheDocument();
});

it("keeps dashboard report visible when recent focus records fail", async () => {
  const focus = focusService();
  vi.mocked(focus.listHistory).mockRejectedValue(new Error("记录读取失败"));
  render(<MemoryRouter><StatisticsPage dashboardService={dashboardService()} focusService={focus} now={new Date(2026, 9, 2, 12)} /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "学习统计" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("专注记录暂时无法读取");
  expect(screen.getByRole("button", { name: "重试专注记录" })).toBeInTheDocument();
});
