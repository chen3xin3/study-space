import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { QuickActions } from "./QuickActions";

it("uses only real homepage shortcuts", async () => {
  const onCreateTask = vi.fn();
  const user = userEvent.setup();
  render(<MemoryRouter><QuickActions onCreateTask={onCreateTask} /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "拍照导入单词" })).toHaveAttribute("href", "/english/words/import");
  expect(screen.getByRole("link", { name: "保存错题" })).toHaveAttribute("href", "/study/math/wrong-questions/new");
  expect(screen.getByRole("link", { name: "添加笔记" })).toHaveAttribute("href", "/study/specialty/notes/new");
  expect(screen.getByRole("link", { name: "临时资料" })).toHaveAttribute("href", "/library/files");
  expect(screen.queryByRole("link", { name: /正在准备中/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "创建任务" }));
  expect(onCreateTask).toHaveBeenCalledOnce();
});
