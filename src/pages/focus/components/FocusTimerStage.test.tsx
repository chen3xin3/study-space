import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { FocusSession } from "../../../services/focus/focus.types";
import { FocusTimerStage } from "./FocusTimerStage";

const active: FocusSession = {
  mode: "pomodoro", subject: "math", goal: "完成高数例题", workSeconds: 1500,
  breakSeconds: 300, longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4,
  autoStartBreak: false, autoStartWork: false, planId: "plan-1", presetId: "builtin-25-5",
  phase: "work", phaseStartedAt: "2026-10-02T01:00:00Z", cycleNumber: 2, cycleStartSeconds: 0,
  timer: { id: "timer-1", status: "running", currentStartedAt: "2026-10-02T01:00:00Z", accumulatedSeconds: 0, endedAt: null, createdAt: "2026-10-02T01:00:00Z", updatedAt: "2026-10-02T01:00:00Z", version: 1 },
};
const clock = { elapsed: 600, phaseElapsed: 600, remaining: 900, progress: 40, activeBreakSeconds: 300, expired: false };

it("shows the active task, cycle map, and essential focus actions", async () => {
  const onPause = vi.fn(); const onInterrupt = vi.fn(); const onFinish = vi.fn(); const user = userEvent.setup();
  render(<FocusTimerStage session={active} clock={clock} busy={false} interruptionCount={0} onPause={onPause} onResume={vi.fn()} onStartBreak={vi.fn()} onNextCycle={vi.fn()} onInterrupt={onInterrupt} onFinish={onFinish} />);
  expect(screen.getByRole("region", { name: "专注计时" })).toHaveAttribute("data-art-direction", "spectrum-console");
  expect(screen.getByTestId("focus-spectrum-wave")).toBeInTheDocument();
  expect(screen.getByText("完成高数例题")).toBeInTheDocument();
  expect(screen.getByLabelText("第 2 轮，共 4 轮")).toBeInTheDocument();
  expect(screen.getByText("2").closest("i")).toHaveStyle({ "--cycle-progress": "40%" });
  expect(screen.getByText("00:15:00")).toBeInTheDocument();
  expect(screen.getByText("有效学习")).toBeInTheDocument();
  expect(screen.getByText("本轮进度")).toBeInTheDocument();
  expect(screen.getByText("中断")).toBeInTheDocument();
  expect(screen.getByText("0 次")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "暂停" }));
  await user.click(screen.getByRole("button", { name: "记录中断" }));
  await user.click(screen.getByRole("button", { name: "结束并复盘" }));
  expect(onPause).toHaveBeenCalledOnce();
  expect(onInterrupt).toHaveBeenCalledOnce();
  expect(onFinish).toHaveBeenCalledOnce();
});

it("labels a configured long break and offers the next cycle", () => {
  render(<FocusTimerStage session={{ ...active, phase: "break", cycleNumber: 4, timer: { ...active.timer, status: "paused", currentStartedAt: null } }} clock={{ ...clock, remaining: 600, activeBreakSeconds: 900 }} busy={false} interruptionCount={0} onPause={vi.fn()} onResume={vi.fn()} onStartBreak={vi.fn()} onNextCycle={vi.fn()} onInterrupt={vi.fn()} onFinish={vi.fn()} />);
  expect(screen.getByText("长休息")).toBeInTheDocument();
  expect(screen.getByText("休息中")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "结束休息，开始第 5 轮" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "结束并复盘" })).toBeInTheDocument();
});

it("makes paused state explicit and keeps break and finish actions available", async () => {
  const onStartBreak = vi.fn();
  const onFinish = vi.fn();
  const user = userEvent.setup();
  render(<FocusTimerStage session={{ ...active, timer: { ...active.timer, status: "paused", currentStartedAt: null } }} clock={clock} busy={false} interruptionCount={0} onPause={vi.fn()} onResume={vi.fn()} onStartBreak={onStartBreak} onNextCycle={vi.fn()} onInterrupt={vi.fn()} onFinish={onFinish} />);
  expect(screen.getByText("已暂停")).toBeInTheDocument();
  const breakButton = screen.getByRole("button", { name: "开始休息" });
  expect(breakButton).toBeEnabled();
  await user.click(breakButton);
  await user.click(screen.getByRole("button", { name: "结束并复盘" }));
  expect(onStartBreak).toHaveBeenCalledOnce();
  expect(onFinish).toHaveBeenCalledOnce();
});
