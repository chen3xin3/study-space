import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "./App";

it("loads the dashboard behind an accessible route boundary", async () => {
  render(<MemoryRouter><App /></MemoryRouter>);

  expect(screen.getByRole("status", { name: "正在打开页面" })).toBeInTheDocument();
  expect(await screen.findByText("学习日历")).toBeInTheDocument();
});

it("navigates through every main workspace", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><App /></MemoryRouter>);
  const destinations = [
    ["英语", "英语"], ["数学", "数学"], ["专业课", "专业课"], ["政治", "政治"],
    ["专注学习", "准备进入下一轮专注"], ["学习统计", "学习统计"],
    ["资料库", "资料库"], ["设置", "让空间更适合你"],
  ] as const;
  for (const [link, heading] of destinations) {
    await user.click(screen.getByRole("link", { name: link }));
    expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
  }
});

it("keeps photo and inbox workspaces under the unified library", async () => {
  const { unmount } = render(<MemoryRouter initialEntries={["/library/photos"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "学习照片", level: 1 })).toBeInTheDocument();
  unmount();

  render(<MemoryRouter initialEntries={["/library/files"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "收件箱", level: 1 })).toBeInTheDocument();
});

it("opens the AI organization workbench under the library", async () => {
  render(<MemoryRouter initialEntries={["/library/organize"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "智能整理台", level: 1 })).toBeInTheDocument();
});

it.each([
  ["/photos", "学习照片"],
  ["/inbox", "收件箱"],
])("redirects legacy %s routes into the library", async (path, heading) => {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "资料库" })).toHaveAttribute("aria-current", "page");
});

it("applies and persists a selected theme", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/settings"]}><App /></MemoryRouter>);
  const nightTheme = await screen.findByRole("radio", { name: "主题 深色夜间" });
  await user.click(nightTheme.closest("label")!);
  expect(document.documentElement.dataset.theme).toBe("night");
  expect(localStorage.getItem("study-space.settings.v1")).toContain('"theme":"night"');
});

it("applies compact density to the document", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/settings"]}><App /></MemoryRouter>);
  await user.selectOptions(await screen.findByLabelText("界面密度"), "compact");
  expect(document.documentElement.dataset.density).toBe("compact");
  expect(localStorage.getItem("study-space.settings.v1")).toContain('"density":"compact"');
});

it("redirects legacy English creation URLs to photo intake", async () => {
  const { unmount } = render(<MemoryRouter initialEntries={["/english/words/new"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "拍照导入单词" })).toBeInTheDocument();
  unmount();
  render(<MemoryRouter initialEntries={["/english/essays/new"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "拍照导入作文" })).toBeInTheDocument();
});

it("opens real subject collections and editors without a placeholder page", async () => {
  const { unmount } = render(<MemoryRouter initialEntries={["/study/math/wrong-questions"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "我的错题库" })).toBeInTheDocument();
  expect(screen.queryByText(/正在准备中/)).not.toBeInTheDocument();
  unmount();

  render(<MemoryRouter initialEntries={["/study/politics/exams/new"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "新建模拟考试" })).toBeInTheDocument();
  expect(screen.getByLabelText("得分")).toBeInTheDocument();
});

it("routes math wrong questions into the dedicated redo flow", async () => {
  render(<MemoryRouter initialEntries={["/study/math/wrong-questions/item-1/review"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "错题重做" })).toBeInTheDocument();
});

it("routes essay history before the generic essay detail route", async () => {
  render(<MemoryRouter initialEntries={["/english/essays/history"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "写作记录", level: 1 })).toBeInTheDocument();
  expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();
});

it("redirects removed planned feature routes to the dashboard", async () => {
  render(<MemoryRouter initialEntries={["/planned/math/unknown"]}><App /></MemoryRouter>);

  expect(await screen.findByRole("link", { name: "首页" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByText(/正在准备中/)).not.toBeInTheDocument();
});

it("keeps the English exam archive route available after the experience refresh", async () => {
  render(<MemoryRouter initialEntries={["/english"]}><App /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "英语" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /试卷资料库/ })).toHaveAttribute("href", "/study/english/exams");
});
