import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FocusInterruptionDialog } from "./FocusInterruptionDialog";

it("records every interruption reason and can continue", async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<FocusInterruptionDialog open busy={false} onClose={vi.fn()} onSubmit={onSubmit} />);
  for (const label of ["手机消息", "临时急事", "环境干扰", "身体状态", "其他原因"]) {
    expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
  }
  await user.click(screen.getByRole("radio", { name: "环境干扰" }));
  await user.type(screen.getByLabelText("补充说明"), "楼下施工");
  await user.click(screen.getByRole("button", { name: "记录并继续" }));
  expect(onSubmit).toHaveBeenCalledWith({ reason: "environment", note: "楼下施工", pause: false });
});

it("can record and pause while enforcing the note limit", async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<FocusInterruptionDialog open busy={false} onClose={vi.fn()} onSubmit={onSubmit} />);
  const note = screen.getByLabelText("补充说明");
  expect(note).toHaveAttribute("maxlength", "120");
  await user.click(screen.getByRole("radio", { name: "临时急事" }));
  await user.click(screen.getByRole("button", { name: "记录并暂停" }));
  expect(onSubmit).toHaveBeenCalledWith({ reason: "urgent", note: "", pause: true });
});

it("closes on escape without submitting", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<FocusInterruptionDialog open busy={false} onClose={onClose} onSubmit={vi.fn()} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
