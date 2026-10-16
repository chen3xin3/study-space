import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FocusReviewDialog } from "./FocusReviewDialog";

it("requires a rating and submits the complete review", async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<FocusReviewDialog open busy={false} goal="英语精读" hasPlan effectiveSeconds={3120} interruptionCount={2} defaultCompletedCycles={2} onClose={vi.fn()} onSubmit={onSubmit} />);
  expect(screen.getByText("52 分钟")).toBeInTheDocument();
  expect(screen.getByText("2 次中断")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认结束" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: "专注评分 4 分" }));
  await user.click(screen.getByLabelText("这次完成了计划"));
  await user.type(screen.getByLabelText("复盘笔记"), "节奏不错，下次提前关手机");
  await user.click(screen.getByRole("button", { name: "确认结束" }));
  expect(onSubmit).toHaveBeenCalledWith({ planCompleted: true, completedCycles: 2, focusRating: 4, note: "节奏不错，下次提前关手机" });
});

it("cancels without submitting and keeps entered text on retryable errors", async () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<FocusReviewDialog open busy={false} goal="高数" hasPlan={false} effectiveSeconds={600} interruptionCount={0} defaultCompletedCycles={0} onClose={onClose} onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText("复盘笔记"), "保留我写的内容");
  rerender(<FocusReviewDialog open busy={false} error="保存失败，请重试" goal="高数" hasPlan={false} effectiveSeconds={600} interruptionCount={0} defaultCompletedCycles={0} onClose={onClose} onSubmit={onSubmit} />);
  expect(screen.getByLabelText("复盘笔记")).toHaveValue("保留我写的内容");
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败，请重试");
  await user.click(screen.getByRole("button", { name: "取消复盘" }));
  expect(onClose).toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});
