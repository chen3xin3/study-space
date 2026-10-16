import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import { fakeLearningService, learningItem } from "../study/study-test-helpers";
import { LibraryPage } from "./LibraryPage";

function dashboardService(): DashboardService {
  return {
    getSummary: vi.fn(), getCalendarMonth: vi.fn(), createTask: vi.fn().mockResolvedValue({}), setTaskCompleted: vi.fn(), deleteTask: vi.fn(),
    startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), endTimer: vi.fn(),
  } as DashboardService;
}

it("organizes the library by postgraduate subjects", () => {
  render(<MemoryRouter><LibraryPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "资料库", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "打开智能整理台" })).toHaveAttribute("href", "/library/organize");
  for (const name of ["全部资料", "英语", "数学", "专业课", "政治", "其他"]) {
    expect(screen.getByRole("link", { name })).toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "学习照片" })).toHaveAttribute("href", "/library/photos");
  expect(screen.getByRole("link", { name: "文件与笔记" })).toHaveAttribute("href", "/library/files");
  for (const name of ["最近使用", "收藏", "回收站"]) {
    expect(screen.getByRole("link", { name })).toBeInTheDocument();
  }
});

it("shows English-specific collections when English is selected", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><LibraryPage /></MemoryRouter>);
  await user.click(screen.getByRole("link", { name: "英语" }));
  expect(screen.getByRole("link", { name: "单词本" })).toHaveAttribute("href", "/english/words");
  expect(screen.getByRole("link", { name: "作文库" })).toHaveAttribute("href", "/english/essays");
});

it("presents a subject shelf with connected study actions and no invented counts", () => {
  render(<MemoryRouter initialEntries={["/library?subject=math"]}><LibraryPage /></MemoryRouter>);
  expect(screen.getByRole("navigation", { name: "学习轨迹" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "数学书架" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /开始数学专注/ })).toHaveAttribute("href", "/focus?subject=math");
  expect(screen.getByRole("link", { name: "学习照片" })).toHaveAttribute("href", "/library/photos");
  expect(screen.queryByText(/\d+ 份资料/)).not.toBeInTheDocument();
});

it("renders real favorite content instead of a public-view placeholder", async () => {
  const favorite = learningItem({ title: "收藏的极限题", favorite: true });
  const service = fakeLearningService([favorite]);
  render(<MemoryRouter initialEntries={["/library?view=favorites"]}><LibraryPage learningService={service} dashboardService={dashboardService()} /></MemoryRouter>);
  expect(await screen.findByText("收藏的极限题")).toBeInTheDocument();
  await waitFor(() => expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ favorite: true, trash: false })));
  expect(screen.queryByText(/当前不会生成虚假的数量/)).not.toBeInTheDocument();
});

it("falls back safely from invalid subject and view parameters", async () => {
  const service = fakeLearningService();
  render(<MemoryRouter initialEntries={["/library?subject=unknown&view=unknown"]}><LibraryPage learningService={service} dashboardService={dashboardService()} /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "全部资料" })).toHaveAttribute("aria-current", "page");
  await waitFor(() => expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ subject: undefined, favorite: undefined, trash: false })));
});
