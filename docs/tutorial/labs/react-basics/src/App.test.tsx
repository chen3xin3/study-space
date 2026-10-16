import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { InMemoryTaskService } from "./services/in-memory-task-service";

function renderApp() {
  return render(<MemoryRouter initialEntries={["/tasks"]}><App service={new InMemoryTaskService({ delay: 0 })} /></MemoryRouter>);
}

describe("React 状态实验", () => {
  it("可以添加、完成和筛选任务", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("整理一页阅读错题");

    await user.type(screen.getByLabelText("任务名称"), "整理作文素材");
    await user.selectOptions(screen.getByLabelText("科目"), "英语");
    await user.click(screen.getByRole("button", { name: "添加任务" }));

    expect(await screen.findByText("整理作文素材")).toBeTruthy();

    const task = screen.getByText("整理作文素材").closest("li");
    expect(task).not.toBeNull();
    await user.click(task!.querySelector("button")!);
    await user.click(screen.getByRole("button", { name: "待完成" }));

    expect(screen.queryByText("整理作文素材")).toBeNull();
  });

  it("空标题会显示可访问的错误提示", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("整理一页阅读错题");

    await user.click(screen.getByRole("button", { name: "添加任务" }));

    expect(screen.getByRole("alert").textContent).toContain("请输入任务名称");
  });
});
