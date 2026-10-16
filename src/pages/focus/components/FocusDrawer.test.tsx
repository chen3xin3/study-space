import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { FocusDrawer } from "./FocusDrawer";

it("closes an open drawer with Escape", async () => {
  const user = userEvent.setup(); const onClose = vi.fn();
  render(<FocusDrawer open title="专注设置" onClose={onClose}><button>内容</button></FocusDrawer>);
  expect(screen.getByRole("dialog", { name: "专注设置" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

it("renders nothing while closed", () => {
  render(<FocusDrawer open={false} title="专注设置" onClose={vi.fn()}>内容</FocusDrawer>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
