import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DailyProgressCard } from "./DailyProgressCard";
import { DailyTaskList } from "./DailyTaskList";
import { StudyGrowthPanel } from "./StudyGrowthPanel";
import { StudyTimerCard } from "./StudyTimerCard";

it("shows real progress, time and growth values", () => {
  render(<>
    <DailyProgressCard completedTasks={2} totalTasks={5} />
    <StudyTimerCard todaySeconds={4500} timer={null} busy={false} onStart={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onEnd={vi.fn()} />
    <StudyGrowthPanel streakDays={8} trend={[{ localDate: "2026-09-27", seconds: 4500 }]} />
  </>);
  expect(screen.getByText("2 / 5")).toBeInTheDocument();
  expect(screen.getByText("1小时15分钟")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "开始学习" })).toBeInTheDocument();
  expect(screen.getByText("连续学习 8 天")).toBeInTheDocument();
  expect(screen.getByLabelText("9月27日 75分钟")).toBeInTheDocument();
});

it("adds, completes and deletes daily tasks through explicit actions", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onToggle = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const task = { id: "task-1", localDate: "2026-09-27", title: "数学刷题", position: 0, completedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  const { rerender } = render(<DailyTaskList tasks={[]} busy={false} onCreate={onCreate} onToggle={onToggle} onDelete={onDelete} />);
  await user.type(screen.getByLabelText("新增今日待办"), "背单词");
  await user.click(screen.getByRole("button", { name: "添加待办" }));
  expect(onCreate).toHaveBeenCalledWith("背单词");
  rerender(<DailyTaskList tasks={[task]} busy={false} onCreate={onCreate} onToggle={onToggle} onDelete={onDelete} />);
  await user.click(screen.getByRole("checkbox", { name: "完成 数学刷题" }));
  await user.click(screen.getByRole("button", { name: "删除 数学刷题" }));
  expect(onToggle).toHaveBeenCalledWith(task);
  expect(onDelete).toHaveBeenCalledWith(task);
});

it("shows timer actions that match the current state", () => {
  const timer = { id: "timer-1", status: "running" as const, currentStartedAt: "2026-09-27T01:00:00Z", accumulatedSeconds: 0, endedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  render(<StudyTimerCard todaySeconds={60} timer={timer} busy={false} onStart={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onEnd={vi.fn()} />);
  expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "结束" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "开始学习" })).not.toBeInTheDocument();
});

it("does not double count running time when a fresh summary arrives", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T01:00:00Z"));
  const timer = { id: "timer-1", status: "running" as const, currentStartedAt: "2026-09-27T01:00:00Z", accumulatedSeconds: 0, endedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  const actions = { busy: false, onStart: vi.fn(), onPause: vi.fn(), onResume: vi.fn(), onEnd: vi.fn() };
  const { rerender } = render(<StudyTimerCard todaySeconds={0} timer={timer} {...actions} />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText("1分钟")).toBeInTheDocument();
  rerender(<StudyTimerCard todaySeconds={60} timer={{ ...timer }} {...actions} />);
  expect(screen.getByText("1分钟")).toBeInTheDocument();
  vi.useRealTimers();
});
