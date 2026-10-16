import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { DailyStudyPoint } from "../../../services/dashboard/dashboard.types";
import type { FocusHistoryItem } from "../../../services/focus/focus.types";
import { FocusHistoryPanel } from "./FocusHistoryPanel";

const weekPoints: DailyStudyPoint[] = [
  { localDate: "2026-09-27", seconds: 1800 },
  { localDate: "2026-09-28", seconds: 3600 },
];
const history: FocusHistoryItem[] = Array.from({ length: 10 }, (_, index) => ({
  timerId: `timer-${index}`, startedAt: "2026-10-03T08:00:00+08:00", endedAt: "2026-10-03T08:25:00+08:00",
  studySeconds: 1500, mode: "pomodoro", subject: index === 0 ? "math" : "english", goal: index === 0 ? "高数真题" : `英语精读 ${index}`,
  learningItemId: null, dailyTaskId: null,
}));

it("shows weekly totals and expands recent sessions", async () => {
  const user = userEvent.setup();
  render(<FocusHistoryPanel weekPoints={weekPoints} history={history} hasMore={false} busy={false} onLoadMore={vi.fn()} />);
  expect(screen.getByText("累计学习 1 小时 30 分钟")).toBeInTheDocument();
  expect(screen.getByText("高数真题")).toBeInTheDocument();
  expect(screen.queryByText("英语精读 9")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "查看全部记录" }));
  expect(screen.getByText("英语精读 9")).toBeInTheDocument();
});

it("loads older records only after expansion", async () => {
  const onLoadMore = vi.fn(); const user = userEvent.setup();
  render(<FocusHistoryPanel weekPoints={weekPoints} history={history} hasMore busy={false} onLoadMore={onLoadMore} />);
  expect(screen.queryByRole("button", { name: "加载更早记录" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "查看全部记录" }));
  await user.click(screen.getByRole("button", { name: "加载更早记录" }));
  expect(onLoadMore).toHaveBeenCalledOnce();
});
