import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsProvider } from "../../services/settings/SettingsProvider";
import { SubjectPage } from "./SubjectPage";

it("renders the English resource space without review-plan statistics", () => {
  render(<SettingsProvider><MemoryRouter><SubjectPage subject="english" /></MemoryRouter></SettingsProvider>);
  expect(screen.getByRole("heading", { name: "英语" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "英语资料库" })).toBeInTheDocument();
  for (const label of ["拍照导入单词", "拍照导入作文", "单词资料库", "作文资料库"]) {
    expect(screen.getAllByRole("link", { name: new RegExp(label) }).length).toBeGreaterThan(0);
  }
  expect(screen.queryByText("有效单词")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /开始复习/ })).not.toBeInTheDocument();
});

it("renders the required Math home structure", () => {
  render(<MemoryRouter><SubjectPage subject="math" /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "数学" })).toBeInTheDocument();
  const workbench = screen.getByTestId("math-workbench");
  expect(workbench).toHaveAttribute("aria-label", "数学学习功能");
  expect(screen.queryByRole("heading", { name: "知识体系" })).not.toBeInTheDocument();
  for (const label of ["录入错题", "我的错题库", "笔记与例题", "模拟考试"]) {
    expect(within(workbench).getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
  }
  expect(within(workbench).queryByText(/图片优先/)).not.toBeInTheDocument();
});

it("keeps specialty and politics feature sets distinct", () => {
  const { rerender } = render(<MemoryRouter><SubjectPage subject="specialty" /></MemoryRouter>);
  for (const label of ["教材管理", "笔记", "例题", "题库", "错题库", "复习记录", "模拟考试"]) {
    expect(screen.getByRole("link", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
  }
  rerender(<MemoryRouter><SubjectPage subject="politics" /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /背诵/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /主观题练习/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /模拟考试/ })).toBeInTheDocument();
});

it.each([
  ["math", "math-workbench"],
  ["specialty", "bookshelf"],
  ["politics", "newsroom"],
] as const)("renders %s with its %s art direction", (subject, direction) => {
  render(<MemoryRouter><SubjectPage subject={subject} /></MemoryRouter>);
  expect(screen.getByTestId(`${subject}-subject-space`)).toHaveAttribute("data-art-direction", direction);
  if (subject === "math") expect(screen.queryByTestId("math-subject-scene")).not.toBeInTheDocument();
  else expect(screen.getByTestId(`${subject}-subject-scene`)).toHaveAttribute("aria-hidden", "true");
});

it("links subject cards to real learning workspaces and does not invent learning totals", () => {
  render(<MemoryRouter><SubjectPage subject="math" /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /录入错题/ })).toHaveAttribute("href", "/study/math/wrong-questions/new");
  expect(screen.getByRole("link", { name: /我的错题库/ })).toHaveAttribute("href", "/study/math/wrong-questions");
  expect(screen.getByRole("link", { name: /模拟考试/ })).toHaveAttribute("href", "/study/math/exams");
  expect(screen.queryByText(/已完成 \d+|掌握率|本周新增/)).not.toBeInTheDocument();
});

it("keeps bookshelf and newsroom entries accessible", () => {
  const { unmount } = render(<MemoryRouter><SubjectPage subject="specialty" /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /教材管理/ })).toHaveAttribute("data-layout", "shelf");
  unmount();
  render(<MemoryRouter><SubjectPage subject="politics" /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /知识体系/ })).toHaveAttribute("data-layout", "headline");
});

it("does not add an empty-data explanation to the math landing page", () => {
  render(<MemoryRouter><SubjectPage subject="math" /></MemoryRouter>);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText("还没有学习记录")).not.toBeInTheDocument();
  expect(screen.queryByText("今天没有待复习内容")).not.toBeInTheDocument();
});
