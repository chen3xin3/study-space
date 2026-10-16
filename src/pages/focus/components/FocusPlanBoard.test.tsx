import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { FocusPlan, FocusPlanService } from "../../../services/focus/focus.types";
import { FocusPlanBoard } from "./FocusPlanBoard";

const plan = (id: string, title: string, position: number): FocusPlan => ({
  id, localDate: "2026-10-02", title, subject: id === "p1" ? "english" : "math",
  estimatedCycles: 3, completedCycles: 1, repeatRule: "none", linkedDailyTaskId: null,
  completedAt: null, position, createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z", version: 1,
});

function service(): FocusPlanService {
  return {
    list: vi.fn(),
    create: vi.fn(async (input) => ({ ...plan("new", input.title, 0), ...input })),
    update: vi.fn(async (input) => ({ ...plan(input.id, input.title, 0), ...input, version: input.version + 1 })),
    setCompleted: vi.fn(async (input) => ({ ...plan(input.id, "英语复盘", 0), completedAt: input.completed ? "now" : null, version: input.version + 1 })),
    delete: vi.fn(),
    reorder: vi.fn(async (_date: string, ids: string[]) => ids.map((id: string, index: number) => plan(id, id === "p1" ? "英语精读" : "高数例题", index))),
  };
}

it("creates the first focus plan from the empty state", async () => {
  const api = service(); const user = userEvent.setup();
  render(<FocusPlanBoard localDate="2026-10-02" initialPlans={[]} service={api} onStartPlan={vi.fn()} />);
  expect(screen.getByText("今天还没有专注任务")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "添加专注任务" }));
  await user.type(screen.getByLabelText("任务名称"), "英语精读");
  await user.selectOptions(screen.getByLabelText("科目"), "english");
  await user.clear(screen.getByLabelText("预计番茄数"));
  await user.type(screen.getByLabelText("预计番茄数"), "2");
  await user.selectOptions(screen.getByLabelText("重复"), "weekdays");
  await user.click(screen.getByRole("button", { name: "保存任务" }));
  expect(api.create).toHaveBeenCalledWith({ localDate: "2026-10-02", title: "英语精读", subject: "english", estimatedCycles: 2, repeatRule: "weekdays", linkedDailyTaskId: null });
  expect(await screen.findByText("英语精读")).toBeInTheDocument();
});

it("starts, edits, completes, reorders, and deletes plan tickets", async () => {
  const api = service(); const onStart = vi.fn(); const user = userEvent.setup();
  render(<FocusPlanBoard localDate="2026-10-02" initialPlans={[plan("p1", "英语精读", 0), plan("p2", "高数例题", 1)]} service={api} onStartPlan={onStart} />);
  await user.click(screen.getByRole("button", { name: "开始 英语精读" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", subject: "english" }));
  await user.click(screen.getByRole("button", { name: "编辑 英语精读" }));
  await user.clear(screen.getByLabelText("任务名称"));
  await user.type(screen.getByLabelText("任务名称"), "英语复盘");
  await user.click(screen.getByRole("button", { name: "保存任务" }));
  expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", title: "英语复盘", version: 1 }));
  await user.click(screen.getByRole("button", { name: "完成 英语复盘" }));
  expect(api.setCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", completed: true }));
  await user.click(screen.getByRole("button", { name: "下移 英语复盘" }));
  expect(api.reorder).toHaveBeenCalledWith("2026-10-02", ["p2", "p1"]);
  await user.click(screen.getByRole("button", { name: "删除 高数例题" }));
  expect(api.delete).toHaveBeenCalledWith({ id: "p2", version: 1 });
});
