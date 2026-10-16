import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";

describe("application shell", () => {
  it("puts focus directly below home in the navigation", () => {
    render(<App initialEntries={["/"]} />);
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    const links = within(navigation).getAllByRole("link");

    expect(links.map((link) => link.lastElementChild?.textContent)).toEqual([
      "首页",
      "专注学习",
      "学习资料",
      "学习照片",
    ]);
  });

  it("keeps navigation and page content in separate regions", () => {
    render(<App initialEntries={["/focus"]} />);

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("app-content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "专注学习" })).toBeInTheDocument();
  });

  it("creates and completes a daily task while keeping calendar and trend visible", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.type(screen.getByLabelText("新任务"), "整理英语试卷");
    await user.click(screen.getByRole("button", { name: "添加任务" }));
    await user.click(screen.getByRole("checkbox", { name: "整理英语试卷" }));

    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "学习日历" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "最近七天" })).toBeInTheDocument();
  });
});
