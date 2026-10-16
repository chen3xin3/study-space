import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import type { FocusPlanService, FocusPreset, FocusService, FocusSession } from "../../services/focus/focus.types";
import type { FocusCompletionNotifier } from "../../services/notifications/focus-completion-notifier";
import { FocusPage } from "./FocusPage";

function dashboardService(): DashboardService {
  return {
    getSummary: vi.fn().mockResolvedValue({ tasks: [], completedTasks: 0, totalTasks: 0, todaySeconds: 0, timer: null, streakDays: 0, trend: [] }),
    getCalendarMonth: vi.fn(), createTask: vi.fn(), setTaskCompleted: vi.fn(), deleteTask: vi.fn(), startTimer: vi.fn(),
    pauseTimer: vi.fn().mockResolvedValue({ id: "timer-1", status: "paused", currentStartedAt: null, accumulatedSeconds: 60, endedAt: null, createdAt: "now", updatedAt: "now", version: 2 }),
    resumeTimer: vi.fn(), endTimer: vi.fn().mockResolvedValue({}),
  } as unknown as DashboardService;
}

const presets: FocusPreset[] = [
  { id: "builtin-25-5", name: "经典番茄", mode: "pomodoro", workSeconds: 1500, shortBreakSeconds: 300, longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false, createdAt: "now", updatedAt: "now", version: 1 },
  { id: "builtin-50-10", name: "深度学习", mode: "pomodoro", workSeconds: 3000, shortBreakSeconds: 600, longBreakSeconds: 1200, cyclesPerSet: 4, longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false, createdAt: "now", updatedAt: "now", version: 1 },
];

function focusService(active: FocusSession | null = null): FocusService {
  return {
    start: vi.fn().mockResolvedValue(active), getActive: vi.fn().mockResolvedValue(active), setPhase: vi.fn(),
    listPresets: vi.fn().mockResolvedValue(presets), createPreset: vi.fn(), updatePreset: vi.fn(), deletePreset: vi.fn(),
    addInterruption: vi.fn(), listInterruptions: vi.fn().mockResolvedValue([]), completeReview: vi.fn(), getSessionDetail: vi.fn(),
    listHistory: vi.fn().mockResolvedValue([]),
  } as unknown as FocusService;
}

function planService(): FocusPlanService {
  return {
    list: vi.fn().mockResolvedValue([{ id: "plan-1", localDate: "2026-10-02", title: "政治背诵", subject: "politics", estimatedCycles: 2, completedCycles: 0, repeatRule: "none", linkedDailyTaskId: null, completedAt: null, position: 0, createdAt: "now", updatedAt: "now", version: 1 }]),
    create: vi.fn(), update: vi.fn(), setCompleted: vi.fn(), delete: vi.fn(), reorder: vi.fn(),
  } as unknown as FocusPlanService;
}

function activeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    mode: "pomodoro", subject: "english", goal: "精读", workSeconds: 1500, breakSeconds: 300,
    longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4,
    autoStartBreak: false, autoStartWork: false, planId: "plan-1", presetId: "builtin-25-5",
    phase: "work", phaseStartedAt: new Date().toISOString(), cycleNumber: 2, cycleStartSeconds: 1200,
    timer: { id: "timer-1", status: "running", currentStartedAt: new Date().toISOString(), accumulatedSeconds: 1300, endedAt: null, createdAt: "now", updatedAt: "now", version: 1 },
    ...overrides,
  };
}

it("starts the selected study plan through the existing focus service", async () => {
  const focus = focusService(); const dashboard = dashboardService(); const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboard} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "专注设置" }));
  await user.click(await screen.findByRole("button", { name: "深度学习 50/10" }));
  await user.selectOptions(screen.getByLabelText("学习科目"), "math");
  await user.type(screen.getByLabelText("本次目标"), "完成高数例题");
  await user.click(screen.getByRole("button", { name: "开始专注" }));
  expect(focus.start).toHaveBeenCalledWith({
    mode: "pomodoro", subject: "math", goal: "完成高数例题",
    workSeconds: 3000, breakSeconds: 600, longBreakSeconds: 1200,
    cyclesPerSet: 4, longBreakAfterCycles: 4,
    autoStartBreak: false, autoStartWork: false,
    planId: null, presetId: "builtin-50-10",
  });
  expect(screen.queryByRole("navigation", { name: "学习轨迹" })).not.toBeInTheDocument();
});

it("keeps an active session immutable and exposes the studio regions", async () => {
  const active: FocusSession = {
    mode: "pomodoro", subject: "english", goal: "精读", workSeconds: 1500, breakSeconds: 300,
    longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4,
    autoStartBreak: false, autoStartWork: false, planId: null, presetId: "builtin-25-5",
    phase: "work", phaseStartedAt: new Date().toISOString(), cycleNumber: 1, cycleStartSeconds: 0,
    timer: { id: "timer-1", status: "running", currentStartedAt: new Date().toISOString(), accumulatedSeconds: 0, endedAt: null, createdAt: "now", updatedAt: "now", version: 1 },
  };
  const focus = focusService(active); const dashboard = dashboardService(); const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboard} /></MemoryRouter>);
  expect(await screen.findByRole("region", { name: "专注计时" })).toHaveAttribute("data-art-direction", "spectrum-console");
  expect(screen.getByRole("heading", { level: 1, name: /好，准备进入第 1 轮/ })).toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "专注控制台" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "专注设置" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "暂停" }));
  expect(dashboard.pauseTimer).toHaveBeenCalled();
});

it("uses a valid subject from a library handoff", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/focus?subject=politics"]}><FocusPage focusService={focusService()} dashboardService={dashboardService()} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "专注设置" }));
  expect(await screen.findByLabelText("学习科目")).toHaveValue("politics");
});

it("prefills and preserves the learning item from a study handoff", async () => {
  const focus = focusService();
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/focus?subject=math&goal=%E6%9E%81%E9%99%90%E8%AE%A1%E7%AE%97&learningItemId=item-1"]}><FocusPage focusService={focus} dashboardService={dashboardService()} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "专注设置" }));
  expect(screen.getByLabelText("学习科目")).toHaveValue("math");
  expect(screen.getByLabelText("本次目标")).toHaveValue("极限计算");
  await user.click(screen.getByRole("button", { name: "开始专注" }));
  expect(focus.start).toHaveBeenCalledWith(expect.objectContaining({ subject: "math", goal: "极限计算", learningItemId: "item-1" }));
});

it("starts from a selected focus plan ticket", async () => {
  const focus = focusService(); const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboardService()} focusPlanService={planService()} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "开始 政治背诵" }));
  expect(screen.getByLabelText("学习科目")).toHaveValue("politics");
  expect(screen.getByLabelText("本次目标")).toHaveValue("政治背诵");
  await user.click(screen.getByRole("button", { name: "开始专注" }));
  expect(focus.start).toHaveBeenCalledWith(expect.objectContaining({ planId: "plan-1", subject: "politics", goal: "政治背诵" }));
});

it("records an interruption before optionally pausing", async () => {
  const focus = focusService(activeSession());
  (focus.addInterruption as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "int-1", timerId: "timer-1", reason: "phone", note: "回了消息", elapsedSeconds: 1300, createdAt: "now" });
  const dashboard = dashboardService();
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboard} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "记录中断" }));
  await user.type(screen.getByLabelText("补充说明"), "回了消息");
  await user.click(screen.getByRole("button", { name: "记录并暂停" }));
  expect(focus.addInterruption).toHaveBeenCalledWith(expect.objectContaining({ timerId: "timer-1", reason: "phone", note: "回了消息" }));
  expect(dashboard.pauseTimer).toHaveBeenCalled();
});

it("starts a break from a paused session without pausing the timer twice", async () => {
  const paused = activeSession({ timer: { ...activeSession().timer, status: "paused", currentStartedAt: null, accumulatedSeconds: 1300 } });
  const focus = focusService(paused);
  const dashboard = dashboardService();
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboard} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "开始休息" }));
  expect(dashboard.pauseTimer).not.toHaveBeenCalled();
  expect(focus.setPhase).toHaveBeenCalledWith({ timerId: "timer-1", phase: "break", cycleNumber: 2, cycleStartSeconds: 1300 });
});

it("cancels a review without ending the active timer", async () => {
  const focus = focusService(activeSession());
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboardService()} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "结束并复盘" }));
  await user.click(screen.getByRole("button", { name: "取消复盘" }));
  expect(focus.completeReview).not.toHaveBeenCalled();
  expect(screen.getByText("第 2 轮专注")).toBeInTheDocument();
});

it("finishes only after a rated review is confirmed", async () => {
  const focus = focusService(activeSession());
  (focus.completeReview as ReturnType<typeof vi.fn>).mockResolvedValue({ timer: {}, review: {}, interruptions: [] });
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboardService()} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "结束并复盘" }));
  await user.click(screen.getByRole("radio", { name: "专注评分 5 分" }));
  await user.click(screen.getByLabelText("这次完成了计划"));
  await user.click(screen.getByRole("button", { name: "确认结束" }));
  expect(focus.completeReview).toHaveBeenCalledWith(expect.objectContaining({ timerId: "timer-1", timerVersion: 1, completedCycles: 1, planCompleted: true, focusRating: 5 }));
});

it("retries a review once with the latest timer version after a conflict", async () => {
  const first = activeSession();
  const latest = activeSession({ timer: { ...first.timer, version: 2 } });
  const focus = focusService(first);
  (focus.getActive as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(latest)
    .mockResolvedValueOnce(null);
  (focus.completeReview as ReturnType<typeof vi.fn>)
    .mockRejectedValueOnce({ code: "DASHBOARD_CONFLICT", message: "首页数据已发生变化，请重新读取。" })
    .mockResolvedValueOnce({ timer: {}, review: {}, interruptions: [] });
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboardService()} /></MemoryRouter>);

  await user.click(await screen.findByRole("button", { name: "结束并复盘" }));
  await user.click(screen.getByRole("radio", { name: "专注评分 4 分" }));
  await user.click(screen.getByRole("button", { name: "确认结束" }));

  expect(focus.completeReview).toHaveBeenCalledTimes(2);
  expect(focus.completeReview).toHaveBeenNthCalledWith(2, expect.objectContaining({ timerId: "timer-1", timerVersion: 2 }));
  expect(screen.queryByRole("dialog", { name: "给这一段专注画个句号" })).not.toBeInTheDocument();
});

it("shows a structured review error and preserves the note", async () => {
  const focus = focusService(activeSession());
  (focus.completeReview as ReturnType<typeof vi.fn>).mockRejectedValue({
    code: "DATABASE_OPEN_FAILED",
    message: "无法打开本地数据库。",
  });
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focus} dashboardService={dashboardService()} /></MemoryRouter>);

  await user.click(await screen.findByRole("button", { name: "结束并复盘" }));
  await user.click(screen.getByRole("radio", { name: "专注评分 3 分" }));
  await user.type(screen.getByLabelText("复盘笔记"), "保留这段内容");
  await user.click(screen.getByRole("button", { name: "确认结束" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("无法打开本地数据库。");
  expect(screen.getByLabelText("复盘笔记")).toHaveValue("保留这段内容");
  expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
});

it("enters an immersive timer and exits with escape", async () => {
  const user = userEvent.setup();
  const { container } = render(<MemoryRouter><FocusPage focusService={focusService(activeSession())} dashboardService={dashboardService()} /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "沉浸模式" }));
  expect(container.querySelector(".focus-page")).toHaveClass("is-immersive");
  expect(screen.getByRole("button", { name: "退出沉浸" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(container.querySelector(".focus-page")).not.toHaveClass("is-immersive");
});

it("puts the timer before today's tasks and removes decorative journey cards", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><FocusPage focusService={focusService()} dashboardService={dashboardService()} /></MemoryRouter>);
  const workspace = await screen.findByTestId("focus-workspace");
  const timer = within(workspace).getByRole("region", { name: "专注计时" });
  expect(timer).toHaveAttribute("data-art-direction", "spectrum-console");
  expect(workspace).toHaveAttribute("data-layout", "spectrum-console");
  expect(screen.getByText("专注控制台")).toBeInTheDocument();
  const tasks = within(workspace).getByRole("region", { name: "今日任务轨道" });
  expect(timer.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "专注快捷工具" })).toHaveAttribute("data-art-direction", "spectrum-tool-dock");
  expect(screen.queryByRole("navigation", { name: "学习轨迹" })).not.toBeInTheDocument();
  expect(screen.queryByText("FOCUS WORKSPACE")).not.toBeInTheDocument();
  expect(screen.queryByText("TODAY")).not.toBeInTheDocument();
  expect(screen.queryByText(/休息不会计入学习时间/)).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "专注控制台" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看统计" })).toHaveAttribute("href", "/statistics");
  await user.click(screen.getByRole("button", { name: "专注设置" }));
  expect(screen.getByRole("dialog", { name: "专注设置" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "关闭" }));
  await user.click(screen.getByRole("button", { name: "专注环境" }));
  expect(screen.getByRole("dialog", { name: "专注环境" })).toBeInTheDocument();
});

it("shows an in-app completion message when system notification delivery falls back", async () => {
  localStorage.clear();
  const expired = activeSession({
    workSeconds: 1,
    phaseStartedAt: "2026-10-10T01:00:00Z",
    cycleStartSeconds: 0,
    timer: { ...activeSession().timer, currentStartedAt: "2026-10-10T01:00:00Z", accumulatedSeconds: 1 },
  });
  const completionNotifier: FocusCompletionNotifier = {
    notify: vi.fn().mockResolvedValue({ delivered: false, fallbackMessage: "本轮专注已结束，可以休息一下。" }),
  };

  render(<MemoryRouter><FocusPage focusService={focusService(expired)} dashboardService={dashboardService()} completionNotifier={completionNotifier} /></MemoryRouter>);

  expect(await screen.findByRole("status")).toHaveTextContent("本轮专注已结束，可以休息一下。");
  expect(completionNotifier.notify).toHaveBeenCalledTimes(1);
  expect(completionNotifier.notify).toHaveBeenCalledWith("work");
});
