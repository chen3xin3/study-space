import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserFocusService } from "./browser-focus.service";
import { TauriFocusService } from "./tauri-focus.service";
import { BrowserDashboardService } from "../dashboard/browser-dashboard.service";
import { createDashboardDayQuery } from "../../utils/dashboard-calendar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const input = {
  mode: "pomodoro" as const,
  subject: "english" as const,
  goal: "阅读",
  workSeconds: 1500,
  breakSeconds: 300,
  longBreakSeconds: 900,
  cyclesPerSet: 4,
  longBreakAfterCycles: 4,
  autoStartBreak: false,
  autoStartWork: false,
  planId: null,
  presetId: "builtin-25-5",
};

describe("focus service", () => {
  beforeEach(() => localStorage.clear());
  it("retains the active session and moves it to history when the timer ends", async () => {
    const service = new BrowserFocusService();
    const session = await service.start(input);
    expect((await service.getActive())?.timer.id).toBe(session.timer.id);
    await service.setPhase({ timerId: session.timer.id, phase: "break", cycleNumber: 1, cycleStartSeconds: 1500 });
    expect((await service.getActive())?.phase).toBe("break");
    const { BrowserDashboardService } = await import("../dashboard/browser-dashboard.service");
    await new BrowserDashboardService().endTimer({ id: session.timer.id, version: session.timer.version }, new Date().toISOString());
    expect(await service.getActive()).toBeNull();
    expect((await service.listHistory())[0].subject).toBe("english");
  });

  it("stores custom cycles, interruptions, and the final review", async () => {
    const service = new BrowserFocusService();
    const session = await service.start({ ...input, longBreakSeconds: 1800, cyclesPerSet: 3, longBreakAfterCycles: 3, autoStartBreak: true });
    expect((await service.getActive())?.longBreakSeconds).toBe(1800);
    await service.addInterruption({ timerId: session.timer.id, reason: "phone", note: "消息", elapsedSeconds: 120 });
    expect(await service.listInterruptions(session.timer.id)).toHaveLength(1);
    const detail = await service.completeReview({
      timerId: session.timer.id,
      timerVersion: session.timer.version,
      planCompleted: false,
      completedCycles: 1,
      focusRating: 4,
      note: "状态不错",
    });
    expect(detail.review.focusRating).toBe(4);
    expect(detail.interruptions[0].reason).toBe("phone");
    expect(await service.getActive()).toBeNull();
  });

  it("completes a linked daily task and keeps content attribution in history", async () => {
    const dashboard = new BrowserDashboardService();
    const task = await dashboard.createTask({ localDate: "2026-10-03", title: "重做极限错题", learningItemId: "item-1" });
    const service = new BrowserFocusService();
    const session = await service.start({ ...input, subject: "math", goal: task.title, dailyTaskId: task.id, learningItemId: "item-1" });

    await service.completeReview({ timerId: session.timer.id, timerVersion: session.timer.version, planCompleted: true, completedCycles: 1, focusRating: 5, note: "完成" });

    const summary = await dashboard.getSummary(createDashboardDayQuery(new Date("2026-10-03T12:00:00")));
    expect(summary.tasks[0].completedAt).not.toBeNull();
    expect((await service.listHistory())[0]).toMatchObject({ dailyTaskId: task.id, learningItemId: "item-1" });
  });

  it("leaves a linked daily task open when review says it is unfinished", async () => {
    const dashboard = new BrowserDashboardService();
    const task = await dashboard.createTask({ localDate: "2026-10-03", title: "继续整理笔记", learningItemId: "item-2" });
    const service = new BrowserFocusService();
    const session = await service.start({ ...input, goal: task.title, dailyTaskId: task.id, learningItemId: "item-2" });

    await service.completeReview({ timerId: session.timer.id, timerVersion: session.timer.version, planCompleted: false, completedCycles: 1, focusRating: 4, note: "未完成" });

    const summary = await dashboard.getSummary(createDashboardDayQuery(new Date("2026-10-03T12:00:00")));
    expect(summary.tasks[0].completedAt).toBeNull();
  });

  it("migrates a legacy browser session into the version two snapshot", async () => {
    localStorage.setItem("study-space-focus-v1", JSON.stringify([{
      timerId: "legacy", mode: "pomodoro", subject: "math", goal: "旧记录",
      workSeconds: 1500, breakSeconds: 300, phase: "work",
      phaseStartedAt: "2026-10-01T00:00:00Z", cycleNumber: 1, cycleStartSeconds: 0,
    }]));
    const service = new BrowserFocusService();
    await service.listHistory();
    const stored = JSON.parse(localStorage.getItem("study-space-focus-system-v2") ?? "null");
    expect(stored.version).toBe(2);
    expect(stored.sessions[0]).toMatchObject({ timerId: "legacy", longBreakSeconds: 900, cyclesPerSet: 4 });
    expect(localStorage.getItem("study-space-focus-v1")).not.toBeNull();
  });
});

describe("TauriFocusService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({});
  });

  it("uses stable commands for the complete focus lifecycle", async () => {
    const service = new TauriFocusService();
    await service.start(input);
    await service.addInterruption({ timerId: "timer-1", reason: "phone", note: "", elapsedSeconds: 30 });
    await service.listInterruptions("timer-1");
    const review = { timerId: "timer-1", timerVersion: 2, planCompleted: true, completedCycles: 2, focusRating: 5, note: "完成" };
    await service.completeReview(review);
    await service.getSessionDetail("timer-1");

    expect(invoke).toHaveBeenNthCalledWith(1, "start_focus_session", { input });
    expect(invoke).toHaveBeenNthCalledWith(2, "add_focus_interruption", { input: { timerId: "timer-1", reason: "phone", note: "", elapsedSeconds: 30 } });
    expect(invoke).toHaveBeenNthCalledWith(3, "list_focus_interruptions", { timerId: "timer-1" });
    expect(invoke).toHaveBeenNthCalledWith(4, "complete_focus_review", { input: review });
    expect(invoke).toHaveBeenNthCalledWith(5, "get_focus_session_detail", { timerId: "timer-1" });
  });
});
