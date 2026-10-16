import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "../App";
import type { StudyTask } from "../domain/task";
import type { TaskService } from "../services/task-service";

const firstTask: StudyTask = {
  id: "task-1",
  title: "整理阅读错题",
  subject: "英语",
  completed: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeService(overrides: Partial<TaskService> = {}): TaskService {
  return {
    list: vi.fn(async () => [firstTask]),
    create: vi.fn(async (input) => ({ id: "created", ...input, completed: false })),
    toggle: vi.fn(async () => ({ ...firstTask, completed: true })),
    ...overrides,
  };
}

function renderWithService(service: TaskService) {
  return render(<MemoryRouter initialEntries={["/tasks"]}><App service={service} /></MemoryRouter>);
}

describe("异步任务页面", () => {
  it("通过注入的服务完成创建与切换", async () => {
    const create = vi.fn(async (input) => ({ id: "created", ...input, completed: false }));
    const toggle = vi.fn(async () => ({ ...firstTask, completed: true }));
    const user = userEvent.setup();
    renderWithService(fakeService({ create, toggle }));
    await screen.findByText("整理阅读错题");

    await user.click(screen.getByRole("button", { name: "完成" }));
    expect(toggle).toHaveBeenCalledWith("task-1");

    await user.type(screen.getByLabelText("任务名称"), "整理作文素材");
    await user.click(screen.getByRole("button", { name: "添加任务" }));
    expect(create).toHaveBeenCalledWith({ title: "整理作文素材", subject: "英语" });
  });

  it("先显示加载状态，成功后显示任务", async () => {
    const pending = deferred<StudyTask[]>();
    renderWithService(fakeService({ list: vi.fn(() => pending.promise) }));

    expect(screen.getByRole("status").textContent).toContain("正在加载");
    await act(async () => pending.resolve([firstTask]));
    expect(await screen.findByText("整理阅读错题")).toBeTruthy();
  });

  it("加载失败后可以重试", async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error("暂时无法读取任务"))
      .mockResolvedValueOnce([firstTask]);
    const user = userEvent.setup();
    renderWithService(fakeService({ list }));

    expect((await screen.findByRole("alert")).textContent).toContain("暂时无法读取任务");
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("整理阅读错题")).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("后续刷新失败时保留原有任务", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([firstTask])
      .mockRejectedValueOnce({ reason: "offline" });
    const user = userEvent.setup();
    renderWithService(fakeService({ list }));

    expect(await screen.findByText("整理阅读错题")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "刷新任务" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("整理阅读错题")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("发生未知错误");
  });

  it("保存期间禁用表单，避免重复提交", async () => {
    const pending = deferred<StudyTask>();
    const create = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    renderWithService(fakeService({ create }));
    await screen.findByText("整理阅读错题");

    await user.type(screen.getByLabelText("任务名称"), "整理作文素材");
    await user.click(screen.getByRole("button", { name: "添加任务" }));
    const saving = screen.getByRole("button", { name: "正在保存…" });
    expect(saving.hasAttribute("disabled")).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve({
      id: "created",
      title: "整理作文素材",
      subject: "英语",
      completed: false,
    }));
    expect(await screen.findByText("整理作文素材")).toBeTruthy();
  });
});
