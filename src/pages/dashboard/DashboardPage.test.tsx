import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import type { ReviewQueueService } from "../../services/review-queue/review-queue.types";
import { SettingsProvider } from "../../services/settings/SettingsProvider";
import { DashboardPage } from "./DashboardPage";

function service(): DashboardService {
  return {
    getSummary: vi.fn().mockResolvedValue({ tasks: [], completedTasks: 0, totalTasks: 0, todaySeconds: 0, timer: null, streakDays: 0, trend: [] }),
    getCalendarMonth: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({}), setTaskCompleted: vi.fn().mockResolvedValue({}), deleteTask: vi.fn().mockResolvedValue(undefined),
    startTimer: vi.fn().mockResolvedValue({}), pauseTimer: vi.fn().mockResolvedValue({}), resumeTimer: vi.fn().mockResolvedValue({}), endTimer: vi.fn().mockResolvedValue({}),
  } as unknown as DashboardService;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("renders only the focused daily dashboard", async () => {
  render(<MemoryRouter><SettingsProvider><DashboardPage service={service()} /></SettingsProvider></MemoryRouter>);
  const cockpit = screen.getByRole("region", { name: "备考全局概览" });
  const timeCard = within(cockpit).getByLabelText("当前时间与考研倒计时");
  expect(timeCard).toBeInTheDocument();
  expect(within(timeCard).getByLabelText("考研倒计时摘要")).toBeInTheDocument();
  const insights = screen.getByRole("region", { name: "本月学习节奏" });
  expect(await within(insights).findByLabelText("最近七天学习趋势")).toBeInTheDocument();
  const workspace = screen.getByRole("region", { name: "今日待办与学习日历" });
  const taskList = within(workspace).getByLabelText("今日待办");
  const calendar = within(workspace).getByLabelText("学习日历");
  expect(taskList.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(taskList).toHaveClass("task-list-card");
  expect(calendar).toHaveClass("calendar-card");
  expect(screen.queryByLabelText("今日学习时间")).not.toBeInTheDocument();
  expect(screen.getByLabelText("学习成长")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "快速开始" })).not.toBeInTheDocument();
  for (const removed of ["QUICK START", "快速开始", "四科学习概览", "快速添加", "今日待复习", "最近继续"]) expect(screen.queryByText(removed)).not.toBeInTheDocument();
});

it("organizes the homepage around global exam progress without subject shortcuts", async () => {
  const api = service();
  vi.mocked(api.getSummary).mockResolvedValue({ tasks: [], completedTasks: 3, totalTasks: 5, todaySeconds: 8280, timer: null, streakDays: 12, trend: [] });
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  expect(screen.getByRole("region", { name: "备考全局概览" })).toHaveAttribute("data-art-direction", "fresh-cockpit");
  expect(await screen.findByRole("region", { name: "今日待办与学习日历" })).toHaveClass("dashboard-main-grid");
  expect(screen.getByRole("region", { name: "本月学习节奏" })).toHaveClass("dashboard-trend-grid");
  expect(screen.queryByRole("link", { name: /英语|数学|专业课|政治/ })).not.toBeInTheDocument();
});

it("opens a selected day and refreshes month markers after completing a task", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 27, 12));
  const api = service();
  const task = { id: "task-1", localDate: "2026-09-27", title: "背单词", position: 0, completedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  vi.mocked(api.getCalendarMonth).mockResolvedValue([{ localDate: "2026-09-27", totalTasks: 1, completedTasks: 0, studySeconds: 900 }]);
  vi.mocked(api.getSummary).mockImplementation(async (query) => ({ tasks: query.localDate === "2026-09-27" ? [task] : [], completedTasks: 0, totalTasks: query.localDate === "2026-09-27" ? 1 : 0, todaySeconds: 900, timer: null, streakDays: 0, trend: [] }));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: /9月27日.*今天/ }));
  expect(api.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ localDate: "2026-09-27" }));
  const drawer = await screen.findByRole("dialog", { name: "2026年9月27日星期日安排" });
  await user.click(within(drawer).getByRole("checkbox", { name: "完成 背单词" }));
  expect(api.setTaskCompleted).toHaveBeenCalled();
  expect(api.getCalendarMonth).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it("creates a task through the dashboard service without a redundant timer card", async () => {
  const api = service(); const user = userEvent.setup();
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await screen.findByLabelText("今日待办");
  await user.type(screen.getByLabelText("新增今日待办"), "政治背诵");
  await user.click(screen.getByRole("button", { name: "添加待办" }));
  expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "政治背诵" }));
  expect(screen.queryByRole("button", { name: "开始学习" })).not.toBeInTheDocument();
  expect(api.startTimer).not.toHaveBeenCalled();
});

it("removes the quick-start region while keeping the task composer", async () => {
  render(<MemoryRouter><SettingsProvider><DashboardPage service={service()} /></SettingsProvider></MemoryRouter>);
  await screen.findByLabelText("今日待办");
  expect(screen.queryByRole("region", { name: "快速开始" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("新增今日待办")).toBeInTheDocument();
});

it("shows the unified review queue without replacing core dashboard sections", async () => {
  const reviewQueueService: ReviewQueueService = {
    load: vi.fn().mockResolvedValue({
      pendingTasks: [], dueWords: 2, dueLearningItems: [], dueMathWrongQuestions: 1,
      dueOtherLearningItems: 0, totalDue: 3, nextHref: "/english/review", failures: [],
    }),
  };
  render(<MemoryRouter><SettingsProvider><DashboardPage service={service()} reviewQueueService={reviewQueueService} /></SettingsProvider></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "今日复习" })).toBeInTheDocument();
  expect(screen.getByLabelText("今日待办")).toBeInTheDocument();
  expect(screen.getByLabelText("学习日历")).toBeInTheDocument();
  expect(screen.getByLabelText("最近七天学习趋势")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "快速开始" })).not.toBeInTheDocument();
  expect(reviewQueueService.load).toHaveBeenCalledWith(expect.objectContaining({ tasks: [] }));
});

it("refreshes the dashboard query after local midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 27, 23, 59, 59, 900));
  const api = service();
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await act(async () => { await Promise.resolve(); });
  expect(vi.mocked(api.getSummary).mock.calls[0][0].localDate).toBe("2026-09-27");
  await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
  expect(vi.mocked(api.getSummary).mock.calls.at(-1)?.[0].localDate).toBe("2026-09-28");
  vi.useRealTimers();
});

it("ignores a stale month response after rapid navigation", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 27, 12));
  const api = service();
  const september = deferred<Awaited<ReturnType<DashboardService["getCalendarMonth"]>>>();
  const october = deferred<Awaited<ReturnType<DashboardService["getCalendarMonth"]>>>();
  vi.mocked(api.getCalendarMonth).mockReturnValueOnce(september.promise).mockReturnValueOnce(october.promise);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "下个月" }));
  october.resolve([{ localDate: "2026-10-01", totalTasks: 1, completedTasks: 0, studySeconds: 0 }]);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("button", { name: /10月1日.*待办完成0项，共1项/ })).toBeInTheDocument();
  september.resolve([{ localDate: "2026-09-28", totalTasks: 1, completedTasks: 0, studySeconds: 0 }]);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("button", { name: /10月1日.*待办完成0项，共1项/ })).toBeInTheDocument();
  vi.useRealTimers();
});

it("reloads the selected day and month after a task conflict", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 27, 12));
  const api = service();
  const task = { id: "task-1", localDate: "2026-09-27", title: "背单词", position: 0, completedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  vi.mocked(api.getCalendarMonth).mockResolvedValue([{ localDate: "2026-09-27", totalTasks: 1, completedTasks: 0, studySeconds: 0 }]);
  vi.mocked(api.getSummary).mockResolvedValue({ tasks: [task], completedTasks: 0, totalTasks: 1, todaySeconds: 0, timer: null, streakDays: 0, trend: [] });
  vi.mocked(api.setTaskCompleted).mockRejectedValue(new Error("待办已发生变化，请重试"));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: /9月27日.*今天/ }));
  const drawer = await screen.findByRole("dialog", { name: /2026年9月27日星期日安排/ });
  await user.click(within(drawer).getByRole("checkbox", { name: "完成 背单词" }));
  expect(await within(drawer).findByRole("alert")).toHaveTextContent("待办已发生变化，请重试");
  expect(api.getSummary).toHaveBeenCalledTimes(3);
  expect(api.getCalendarMonth).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it("ignores yesterday's summary when it resolves after midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 27, 23, 59, 59, 900));
  const api = service();
  const yesterday = deferred<Awaited<ReturnType<DashboardService["getSummary"]>>>();
  const today = deferred<Awaited<ReturnType<DashboardService["getSummary"]>>>();
  vi.mocked(api.getSummary).mockReturnValueOnce(yesterday.promise).mockReturnValueOnce(today.promise);
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
  today.resolve({ tasks: [], completedTasks: 0, totalTasks: 2, todaySeconds: 0, timer: null, streakDays: 0, trend: [] });
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("progressbar", { name: "今日任务完成进度" })).toHaveAttribute("aria-valuenow", "0");
  yesterday.resolve({ tasks: [], completedTasks: 1, totalTasks: 1, todaySeconds: 0, timer: null, streakDays: 0, trend: [] });
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("progressbar", { name: "今日任务完成进度" })).toHaveAttribute("aria-valuenow", "0");
  expect(screen.queryByText("100%")).not.toBeInTheDocument();
  vi.useRealTimers();
});

it("does not report a saved task as failed when only the detail refresh fails", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 27, 12));
  const api = service();
  const emptySummary = { tasks: [], completedTasks: 0, totalTasks: 0, todaySeconds: 0, timer: null, streakDays: 0, trend: [] };
  vi.mocked(api.getSummary).mockResolvedValueOnce(emptySummary).mockResolvedValueOnce(emptySummary).mockRejectedValueOnce(new Error("刷新失败"));
  vi.mocked(api.getCalendarMonth).mockResolvedValue([]);
  vi.mocked(api.createTask).mockResolvedValue({ id: "task-new", localDate: "2026-09-27", title: "作文默写", position: 0, completedAt: null, createdAt: "now", updatedAt: "now", version: 1 });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter><SettingsProvider><DashboardPage service={api} /></SettingsProvider></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: /9月27日.*今天/ }));
  const drawer = await screen.findByRole("dialog", { name: /2026年9月27日星期日安排/ });
  const input = within(drawer).getByLabelText("新增当天待办");
  await user.type(input, "作文默写");
  await user.click(within(drawer).getByRole("button", { name: "添加" }));
  expect(input).toHaveValue("");
  expect(within(drawer).getByRole("status")).toHaveTextContent("已添加待办");
  expect(within(drawer).getByRole("alert")).toHaveTextContent("待办已保存，但当天记录刷新失败");
  expect(api.createTask).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
