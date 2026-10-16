import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createStatisticsRange } from "../statistics.model";
import { StatisticsRangePicker } from "./StatisticsRangePicker";

it("switches periods and moves the current range", async () => {
  const user = userEvent.setup(); const onPeriodChange = vi.fn(); const onMove = vi.fn();
  render(<StatisticsRangePicker period="week" range={createStatisticsRange("week", new Date(2026, 9, 3))} onPeriodChange={onPeriodChange} onMove={onMove} onCustomRangeChange={vi.fn()} />);
  await user.click(screen.getByRole("tab", { name: "月" }));
  expect(onPeriodChange).toHaveBeenCalledWith("month");
  await user.click(screen.getByRole("button", { name: "下一个时间段" }));
  expect(onMove).toHaveBeenCalledWith(1);
});

it("shows date inputs only for a custom range", () => {
  render(<StatisticsRangePicker period="custom" range={createStatisticsRange("custom", new Date(2026, 9, 3))} onPeriodChange={vi.fn()} onMove={vi.fn()} onCustomRangeChange={vi.fn()} />);
  expect(screen.getByLabelText("开始日期")).toBeInTheDocument();
  expect(screen.getByLabelText("结束日期")).toBeInTheDocument();
});
