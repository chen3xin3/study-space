import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { StatisticsShareAction } from "./StatisticsShareAction";

afterEach(() => { vi.restoreAllMocks(); });

it("uses system sharing when available", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  const user = userEvent.setup(); render(<StatisticsShareAction text="学习统计摘要" />);
  await user.click(screen.getByRole("button", { name: "分享统计" }));
  expect(share).toHaveBeenCalledWith({ title: "学习统计", text: "学习统计摘要" });
});

it("copies the summary when system sharing is unavailable", async () => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<StatisticsShareAction text="学习统计摘要" />);
  await user.click(screen.getByRole("button", { name: "复制统计摘要" }));
  expect(writeText).toHaveBeenCalledWith("学习统计摘要");
  expect(screen.getByRole("status")).toHaveTextContent("已复制统计摘要");
});
