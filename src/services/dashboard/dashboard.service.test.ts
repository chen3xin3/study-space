import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { TauriDashboardService } from "./tauri-dashboard.service";
import { BrowserDashboardService } from "./browser-dashboard.service";
import type { DashboardDayQuery } from "./dashboard.types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue({});
});

it("uses stable dashboard command names and envelopes", async () => {
  const service = new TauriDashboardService();
  const query: DashboardDayQuery = {
    localDate: "2026-09-27",
    dayStartUtc: "2026-09-26T16:00:00Z",
    dayEndUtc: "2026-09-27T16:00:00Z",
    sevenDays: [],
  };
  await service.getSummary(query);
  await service.createTask({ localDate: "2026-09-27", title: "背单词" });
  await service.setTaskCompleted({ id: "task-1", version: 1, completed: true });
  await service.deleteTask({ id: "task-1", version: 2 });
  await service.startTimer("2026-09-27T01:00:00Z");
  await service.pauseTimer({ id: "timer-1", version: 1 }, "2026-09-27T01:30:00Z");
  await service.resumeTimer({ id: "timer-1", version: 2 }, "2026-09-27T02:00:00Z");
  await service.endTimer({ id: "timer-1", version: 3 }, "2026-09-27T02:15:00Z");

  expect(invoke).toHaveBeenNthCalledWith(1, "get_dashboard_summary", { query });
  expect(invoke).toHaveBeenNthCalledWith(2, "create_daily_task", { input: { localDate: "2026-09-27", title: "背单词" } });
  expect(invoke).toHaveBeenNthCalledWith(3, "set_daily_task_completed", { input: { id: "task-1", version: 1, completed: true } });
  expect(invoke).toHaveBeenNthCalledWith(4, "delete_daily_task", { input: { id: "task-1", version: 2 } });
  expect(invoke).toHaveBeenNthCalledWith(5, "start_study_timer", { now: "2026-09-27T01:00:00Z" });
  expect(invoke).toHaveBeenNthCalledWith(6, "pause_study_timer", { input: { id: "timer-1", version: 1 }, now: "2026-09-27T01:30:00Z" });
  expect(invoke).toHaveBeenNthCalledWith(7, "resume_study_timer", { input: { id: "timer-1", version: 2 }, now: "2026-09-27T02:00:00Z" });
  expect(invoke).toHaveBeenNthCalledWith(8, "end_study_timer", { input: { id: "timer-1", version: 3 }, now: "2026-09-27T02:15:00Z" });
});

it("uses one command for a complete calendar month", async () => {
  vi.mocked(invoke).mockResolvedValue([
    { localDate: "2026-09-27", totalTasks: 2, completedTasks: 1, studySeconds: 900 },
  ]);
  const service = new TauriDashboardService();
  const query = {
    days: [{ localDate: "2026-09-27", startUtc: "start", endUtc: "end" }],
  };
  await expect(service.getCalendarMonth(query)).resolves.toHaveLength(1);
  expect(invoke).toHaveBeenCalledWith("get_calendar_month", { query });
});

it("persists the learning item that created a daily task", async () => {
  localStorage.clear();
  const service = new BrowserDashboardService();
  const task = await service.createTask({ localDate: "2026-10-03", title: "重做极限错题", learningItemId: "item-1" });
  expect(task.learningItemId).toBe("item-1");
  const summary = await service.getSummary({ localDate: "2026-10-03", dayStartUtc: "2026-10-02T16:00:00Z", dayEndUtc: "2026-10-03T16:00:00Z", sevenDays: [] });
  expect(summary.tasks[0]?.learningItemId).toBe("item-1");
});
