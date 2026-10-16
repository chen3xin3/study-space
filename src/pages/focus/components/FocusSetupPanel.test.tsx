import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { FocusPreset } from "../../../services/focus/focus.types";
import { FocusSetupPanel } from "./FocusSetupPanel";

const presets: FocusPreset[] = [
  { id: "builtin-25-5", name: "经典番茄", mode: "pomodoro", workSeconds: 1500, shortBreakSeconds: 300, longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false, createdAt: "now", updatedAt: "now", version: 1 },
  { id: "builtin-90-20", name: "沉浸长时段", mode: "pomodoro", workSeconds: 5400, shortBreakSeconds: 1200, longBreakSeconds: 1800, cyclesPerSet: 2, longBreakAfterCycles: 2, autoStartBreak: false, autoStartWork: false, createdAt: "now", updatedAt: "now", version: 1 },
];

it("starts from a preset and allows every cycle value to be customized", async () => {
  const onStart = vi.fn(); const user = userEvent.setup();
  render(<FocusSetupPanel presets={presets} initialSubject="english" initialGoal="" planId={null} onStart={onStart} onSavePreset={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "沉浸长时段 90/20" }));
  expect(screen.getByLabelText("专注分钟")).toHaveValue(90);
  expect(screen.getByLabelText("短休息分钟")).toHaveValue(20);
  await user.clear(screen.getByLabelText("每组轮数"));
  await user.type(screen.getByLabelText("每组轮数"), "3");
  await user.clear(screen.getByLabelText("长休息轮次"));
  await user.type(screen.getByLabelText("长休息轮次"), "3");
  await user.click(screen.getByLabelText("自动开始休息"));
  await user.type(screen.getByLabelText("本次目标"), "完成真题阅读");
  await user.click(screen.getByRole("button", { name: "开始专注" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ workSeconds: 5400, breakSeconds: 1200, longBreakSeconds: 1800, cyclesPerSet: 3, longBreakAfterCycles: 3, autoStartBreak: true, presetId: "builtin-90-20", goal: "完成真题阅读" }));
});

it("shows validation and does not silently clamp invalid values", async () => {
  const onStart = vi.fn(); const user = userEvent.setup();
  render(<FocusSetupPanel presets={presets} initialSubject="math" initialGoal="高数" planId="plan-1" onStart={onStart} onSavePreset={vi.fn()} />);
  await user.clear(screen.getByLabelText("专注分钟"));
  await user.type(screen.getByLabelText("专注分钟"), "0");
  expect(screen.getByRole("alert")).toHaveTextContent("专注时长需为 1–240 分钟");
  expect(screen.getByRole("button", { name: "开始专注" })).toBeDisabled();
  expect(onStart).not.toHaveBeenCalled();
});

it("saves the current values as a named local preset", async () => {
  const onSave = vi.fn(); const user = userEvent.setup();
  render(<FocusSetupPanel presets={presets} initialSubject="english" initialGoal="" planId={null} onStart={vi.fn()} onSavePreset={onSave} />);
  await user.type(screen.getByLabelText("方案名称"), "晨间冲刺");
  await user.click(screen.getByRole("button", { name: "保存为我的方案" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "晨间冲刺", workSeconds: 1500, shortBreakSeconds: 300 }));
});
