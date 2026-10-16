import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { SettingsProvider } from "../services/settings/SettingsProvider";
import { AppShell } from "./AppShell";

function renderShell(path = "/math") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="math" element={<h1>数学首页</h1>} />
          </Route>
        </Routes>
      </SettingsProvider>
    </MemoryRouter>,
  );
}

it("renders all main navigation entries and marks the current page", () => {
  renderShell();
  expect(screen.getByRole("banner")).toHaveClass("brand-bar");
  expect(screen.getByRole("main", { name: "学习内容" })).toBeInTheDocument();
  const expected = ["首页", "专注学习", "英语", "数学", "专业课", "政治", "学习统计", "资料库", "设置"];
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual(expected);
  for (const group of ["总览", "备考科目", "学习工具", "系统"]) {
    expect(screen.getByText(group)).toBeInTheDocument();
  }
  expect(screen.queryByRole("link", { name: "学习照片" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "收件箱" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "数学" })).toHaveAttribute("aria-current", "page");
});

it("uses a compact brand and independent navigation and content scrollers", () => {
  renderShell();
  expect(screen.getByText("学习空间")).toBeInTheDocument();
  expect(screen.queryByText("我的考研空间")).not.toBeInTheDocument();
  expect(screen.getByTestId("app-sidebar")).toHaveClass("sidebar");
  expect(screen.getByRole("main", { name: "学习内容" })).toHaveClass("app-content");
});

it("persists the collapsed sidebar preference", async () => {
  const user = userEvent.setup();
  renderShell();
  await user.click(screen.getByRole("button", { name: "收起导航" }));
  expect(screen.getByTestId("app-sidebar")).toHaveAttribute("data-collapsed", "true");
  expect(localStorage.getItem("study-space.settings.v1")).toContain('"sidebarCollapsed":true');
});
