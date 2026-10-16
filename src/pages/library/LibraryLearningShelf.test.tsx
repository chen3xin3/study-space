import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import { fakeLearningService, learningItem } from "../study/study-test-helpers";
import { LibraryLearningShelf } from "./LibraryLearningShelf";

function dashboardService(): DashboardService {
  return {
    getSummary: vi.fn(), getCalendarMonth: vi.fn(), createTask: vi.fn().mockResolvedValue({}), setTaskCompleted: vi.fn(), deleteTask: vi.fn(),
    startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), endTimer: vi.fn(),
  } as DashboardService;
}

function renderShelf(path = "/library?subject=math", items = [learningItem()], dashboard = dashboardService()) {
  const service = fakeLearningService(items);
  const viewParam = new URL(path, "https://example.test").searchParams.get("view");
  const view = viewParam === "recent" || viewParam === "favorites" || viewParam === "trash" ? viewParam : null;
  render(<MemoryRouter initialEntries={[path]}><LibraryLearningShelf subject="math" view={view} service={service} dashboardService={dashboard} /></MemoryRouter>);
  return { service, dashboard };
}

describe("LibraryLearningShelf", () => {
  it("queries real learning content by subject, type and search", async () => {
    const user = userEvent.setup();
    const { service } = renderShelf();
    expect(await screen.findByText("极限计算")).toBeInTheDocument();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ subject: "math", trash: false }));

    await user.selectOptions(screen.getByRole("combobox", { name: "资料类型" }), "note");
    await user.type(screen.getByRole("searchbox", { name: "搜索资料库学习内容" }), "公式");
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ subject: "math", kind: "note", search: "公式" })));
  });

  it.each([
    ["/library?view=favorites", { favorite: true, trash: false }],
    ["/library?view=trash", { favorite: undefined, trash: true }],
  ])("uses real service filters for %s", async (path, expected) => {
    const { service } = renderShelf(path);
    await waitFor(() => expect(service.list).toHaveBeenCalledWith(expect.objectContaining(expected)));
  });

  it("orders the recent view by last opened time", async () => {
    renderShelf("/library?view=recent", [
      learningItem({ id: "older", title: "较早打开", lastOpenedAt: "2026-10-01T08:00:00Z" }),
      learningItem({ id: "newer", title: "最近打开", lastOpenedAt: "2026-10-03T08:00:00Z" }),
    ]);
    await screen.findByText("最近打开");
    expect(screen.getAllByRole("heading", { level: 2 }).slice(1).map((heading) => heading.textContent)).toEqual(["最近打开", "较早打开"]);
  });

  it("hands a learning item to today's tasks and focus", async () => {
    const item = learningItem({ title: "极限专项" });
    const dashboard = dashboardService();
    const user = userEvent.setup();
    renderShelf("/library?subject=math", [item], dashboard);
    await user.click(await screen.findByRole("button", { name: "加入今日任务 极限专项" }));
    expect(dashboard.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "极限专项", learningItemId: item.id }));
    expect(await screen.findByRole("status")).toHaveTextContent("已加入今日任务");

    const href = decodeURIComponent(screen.getByRole("link", { name: "开始专注 极限专项" }).getAttribute("href") ?? "");
    expect(href).toContain("/focus?subject=math");
    expect(href).toContain(`learningItemId=${item.id}`);
  });

  it("shows an honest empty state", async () => {
    renderShelf("/library?subject=math", []);
    expect(await screen.findByText("没有找到符合条件的学习内容")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ 份资料/)).not.toBeInTheDocument();
  });
});
