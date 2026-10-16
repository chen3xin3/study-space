import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StudyWorkspacePage } from "./StudyWorkspacePage";
import { fakeLearningService, learningItem } from "./study-test-helpers";
import type { DashboardService } from "../../services/dashboard/dashboard.types";

function dashboardService(): DashboardService {
  return {
    getSummary: vi.fn(), getCalendarMonth: vi.fn(), createTask: vi.fn().mockResolvedValue({}), setTaskCompleted: vi.fn(), deleteTask: vi.fn(),
    startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), endTimer: vi.fn(),
  } as DashboardService;
}

function renderPage(service = fakeLearningService(), path = "/study/math/wrong-questions", dashboard?: DashboardService) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/study/:subject/:collection" element={<StudyWorkspacePage service={service} dashboardService={dashboard} />} /></Routes></MemoryRouter>);
}

describe("StudyWorkspacePage", () => {
  it("loads a real collection and supports search and favorite", async () => {
    const item = learningItem();
    const service = fakeLearningService([item]);
    const user = userEvent.setup();
    renderPage(service);
    expect(await screen.findByRole("heading", { name: "我的错题库" })).toBeInTheDocument();
    expect(screen.getByText("极限计算")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "搜索学习内容" }), "洛必达");
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "洛必达" })));
    await user.click(screen.getByRole("button", { name: "收藏 极限计算" }));
    expect(service.setFavorite).toHaveBeenCalledWith(item.id, item.version, true);
  });

  it("moves content to trash and restores it", async () => {
    const item = learningItem();
    const service = fakeLearningService([item]);
    const user = userEvent.setup();
    renderPage(service);
    await screen.findByText("极限计算");
    await user.click(screen.getByRole("button", { name: "移入回收站 极限计算" }));
    await user.click(screen.getByRole("tab", { name: "回收站" }));
    expect(await screen.findByText("极限计算")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "恢复 极限计算" }));
    expect(service.setDeleted).toHaveBeenLastCalledWith(item.id, 2, false);
  });

  it("permanently deletes only from trash after confirmation", async () => {
    const trashed = learningItem({ deletedAt: "2026-10-03T09:00:00Z" });
    const service = fakeLearningService([trashed]);
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(service);
    await user.click(screen.getByRole("tab", { name: "回收站" }));
    await user.click(await screen.findByRole("button", { name: "永久删除 极限计算" }));
    expect(service.deletePermanently).toHaveBeenCalledWith(trashed.id, trashed.version);
  });

  it("shows useful empty and invalid-route states", async () => {
    const { unmount } = renderPage();
    expect(await screen.findByText("这里还没有学习内容")).toBeInTheDocument();
    unmount();
    renderPage(fakeLearningService(), "/study/math/missing");
    expect(await screen.findByRole("alert")).toHaveTextContent("未配置学习集合");
  });

  it("presents English exams as an archive", async () => {
    renderPage(fakeLearningService(), "/study/english/exams");
    expect(await screen.findByRole("heading", { name: "英语试卷资料库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新建内容" })).toHaveAttribute("href", "/study/english/exams/new");
  });

  it("adds a learning item to today and prepares a focused session", async () => {
    const item = learningItem({ title: "极限计算专项" });
    const dashboard = dashboardService();
    const user = userEvent.setup();
    renderPage(fakeLearningService([item]), "/study/math/wrong-questions", dashboard);
    await screen.findByText("极限计算专项");

    await user.click(screen.getByRole("button", { name: "加入今日任务 极限计算专项" }));
    expect(dashboard.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "极限计算专项", learningItemId: item.id }));
    expect(await screen.findByRole("status")).toHaveTextContent("已加入今日任务");

    const focusLink = screen.getByRole("link", { name: "开始专注 极限计算专项" });
    const href = decodeURIComponent(focusLink.getAttribute("href") ?? "");
    expect(href).toContain("/focus?subject=math");
    expect(href).toContain("goal=极限计算专项");
    expect(href).toContain(`learningItemId=${item.id}`);
  });
});
