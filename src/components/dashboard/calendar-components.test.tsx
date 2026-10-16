import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import type { DashboardSummary } from "../../services/dashboard/dashboard.types";
import { createCalendarGrid } from "../../utils/dashboard-calendar";
import { CalendarDayDrawer } from "./CalendarDayDrawer";
import { CalendarMonthCard } from "./CalendarMonthCard";

it("marks today, exam day and unfinished task days", () => {
  render(<CalendarMonthCard
    grid={createCalendarGrid(2026, 8)}
    year={2026}
    monthIndex={8}
    today="2026-09-27"
    examDate="2026-09-30"
    summaries={[{ localDate: "2026-09-27", totalTasks: 2, completedTasks: 1, studySeconds: 900 }]}
    loading={false}
    error=""
    selectedDate="2026-09-27"
    onPrevious={vi.fn()}
    onToday={vi.fn()}
    onNext={vi.fn()}
    onSelect={vi.fn()}
    onRetry={vi.fn()}
  />);
  expect(screen.getByRole("button", { name: /9月27日.*今天.*待办完成1项，共2项/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /9月30日.*考试日/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /9月27日/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "回到今天" })).toBeInTheDocument();
});

it("navigates months and selects a calendar date", async () => {
  const user = userEvent.setup();
  const onPrevious = vi.fn();
  const onSelect = vi.fn();
  render(<CalendarMonthCard grid={createCalendarGrid(2026, 8)} year={2026} monthIndex={8} today="2026-09-27" examDate="" summaries={[]} loading={false} error="" selectedDate="" onPrevious={onPrevious} onToday={vi.fn()} onNext={vi.fn()} onSelect={onSelect} onRetry={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "上个月" }));
  await user.click(screen.getByRole("button", { name: /9月27日/ }));
  expect(onPrevious).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith("2026-09-27", expect.anything());
});

it("moves calendar focus with arrow keys and exposes retry", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<CalendarMonthCard grid={createCalendarGrid(2026, 8)} year={2026} monthIndex={8} today="2026-09-27" examDate="" summaries={[]} loading={false} error="本月读取失败" selectedDate="2026-09-27" onPrevious={vi.fn()} onToday={vi.fn()} onNext={vi.fn()} onSelect={vi.fn()} onRetry={onRetry} />);
  const selected = screen.getByRole("button", { name: /9月27日/ });
  selected.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("button", { name: /9月28日/ })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "重新加载月历" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it("keeps one date tabbable when the visible month contains neither today nor selection", () => {
  render(<CalendarMonthCard grid={createCalendarGrid(2026, 10)} year={2026} monthIndex={10} today="2026-09-27" examDate="" summaries={[]} loading={false} error="" selectedDate="2026-09-27" onPrevious={vi.fn()} onToday={vi.fn()} onNext={vi.fn()} onSelect={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByRole("button", { name: /11月1日/ })).toHaveAttribute("tabindex", "0");
});

it("distinguishes weekends, official holidays, and adjusted workdays", () => {
  render(<CalendarMonthCard
    grid={createCalendarGrid(2026, 8)}
    year={2026}
    monthIndex={8}
    today="2026-09-28"
    examDate="2026-09-26"
    summaries={[{ localDate: "2026-09-26", totalTasks: 1, completedTasks: 1, studySeconds: 600 }]}
    loading={false}
    error=""
    selectedDate="2026-09-26"
    onPrevious={vi.fn()}
    onToday={vi.fn()}
    onNext={vi.fn()}
    onSelect={vi.fn()}
    onRetry={vi.fn()}
  />);

  const holiday = screen.getByRole("button", { name: /9月26日.*中秋节.*休/ });
  expect(holiday).toHaveClass("is-holiday", "is-selected", "is-exam", "is-complete");
  expect(within(holiday).getByText("休")).toBeInTheDocument();

  const adjustedWorkday = screen.getByRole("button", { name: /9月20日.*调休安排.*调/ });
  expect(adjustedWorkday).toHaveClass("is-adjusted-workday");
  expect(within(adjustedWorkday).getByText("调")).toBeInTheDocument();

  expect(screen.getByRole("button", { name: /9月19日.*周末/ })).toHaveClass("is-weekend");
});

it("shows lunar context and compact task progress only for the current month", () => {
  render(<CalendarMonthCard
    grid={createCalendarGrid(2026, 8)}
    year={2026}
    monthIndex={8}
    today="2026-09-28"
    examDate=""
    summaries={[
      { localDate: "2026-09-25", totalTasks: 3, completedTasks: 2, studySeconds: 3600 },
      { localDate: "2026-09-24", totalTasks: 1, completedTasks: 1, studySeconds: 0 },
    ]}
    loading={false}
    error=""
    selectedDate="2026-09-25"
    onPrevious={vi.fn()}
    onToday={vi.fn()}
    onNext={vi.fn()}
    onSelect={vi.fn()}
    onRetry={vi.fn()}
  />);

  const midAutumn = screen.getByRole("button", { name: /9月25日.*农历.*中秋节.*待办完成2项，共3项/ });
  expect(midAutumn).toHaveClass("is-holiday", "is-selected");
  expect(within(midAutumn).getByText("中秋节")).toBeInTheDocument();
  expect(within(midAutumn).getByText("2/3")).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: /9月24日.*全部待办已完成/ })).getByLabelText("待办全部完成")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /9月28日.*今天/ })).toHaveClass("is-today");
  const outside = screen.getByRole("button", { name: /8月31日/ });
  expect(outside).toHaveClass("is-outside");
  expect(within(outside).queryByText(/初|十|廿|月/)).not.toBeInTheDocument();
});

it("does not invent a statutory holiday badge for unpublished 2027 dates", () => {
  render(<CalendarMonthCard grid={createCalendarGrid(2027, 0)} year={2027} monthIndex={0} today="2027-01-01" examDate="" summaries={[]} loading={false} error="" selectedDate="" onPrevious={vi.fn()} onToday={vi.fn()} onNext={vi.fn()} onSelect={vi.fn()} onRetry={vi.fn()} />);
  const saturday = screen.getByRole("button", { name: /1月2日.*周末/ });
  expect(saturday).toHaveClass("is-weekend");
  expect(within(saturday).queryByText(/休|调/)).not.toBeInTheDocument();
});

it("manages the selected day's tasks from an accessible drawer", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onToggle = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const task = { id: "task-1", localDate: "2026-09-27", title: "背单词", position: 0, completedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  const summary: DashboardSummary = { tasks: [task], completedTasks: 0, totalTasks: 1, todaySeconds: 900, timer: null, streakDays: 0, trend: [] };
  render(<CalendarDayDrawer open localDate="2026-09-27" summary={summary} loading={false} error="" busy={false} triggerRef={createRef<HTMLButtonElement>()} onClose={vi.fn()} onRetry={vi.fn()} onCreate={onCreate} onToggle={onToggle} onDelete={onDelete} />);
  expect(screen.getByRole("dialog", { name: "2026年9月27日星期日安排" })).toBeInTheDocument();
  expect(screen.getByText("15分钟")).toBeInTheDocument();
  await user.type(screen.getByLabelText("新增当天待办"), "作文默写");
  await user.click(screen.getByRole("button", { name: "添加" }));
  await user.click(screen.getByRole("checkbox", { name: "完成 背单词" }));
  await user.click(screen.getByRole("button", { name: "删除 背单词" }));
  expect(onCreate).toHaveBeenCalledWith("作文默写");
  expect(onToggle).toHaveBeenCalledWith(task);
  expect(onDelete).toHaveBeenCalledWith(task);
});

it("shows full lunar context and real completed and incomplete tasks", () => {
  const completedTask = { id: "task-1", localDate: "2026-09-25", title: "背诵单词", position: 0, completedAt: "2026-09-25T08:00:00.000Z", createdAt: "now", updatedAt: "now", version: 2 };
  const unfinishedTask = { id: "task-2", localDate: "2026-09-25", title: "完成阅读练习", position: 1, completedAt: null, createdAt: "now", updatedAt: "now", version: 1 };
  const summary: DashboardSummary = { tasks: [completedTask, unfinishedTask], completedTasks: 1, totalTasks: 2, todaySeconds: 3600, timer: null, streakDays: 0, trend: [] };

  render(<CalendarDayDrawer open localDate="2026-09-25" summary={summary} loading={false} error="" busy={false} triggerRef={createRef<HTMLButtonElement>()} onClose={vi.fn()} onRetry={vi.fn()} onCreate={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />);

  expect(screen.getByText("农历二〇二六年八月十五")).toBeInTheDocument();
  expect(screen.getByText("中秋节")).toBeInTheDocument();
  expect(screen.getByText("法定假日 · 中秋节")).toBeInTheDocument();
  expect(screen.getByText("背诵单词")).toBeInTheDocument();
  expect(screen.getByText("完成阅读练习")).toBeInTheDocument();
  expect(screen.getByText("1 / 2")).toBeInTheDocument();
});

it("describes adjusted schedules without claiming a school day", () => {
  render(<CalendarDayDrawer open localDate="2026-09-20" summary={null} loading error="" busy={false} triggerRef={createRef<HTMLButtonElement>()} onClose={vi.fn()} onRetry={vi.fn()} onCreate={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />);

  expect(screen.getByText("调休安排")).toBeInTheDocument();
  expect(screen.getByText(/学校具体安排请以学校通知为准/)).toBeInTheDocument();
  expect(screen.queryByText(/上班|补班|补课/)).not.toBeInTheDocument();
});

it("closes the drawer with Escape", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<CalendarDayDrawer open localDate="2026-09-27" summary={null} loading error="" busy={false} triggerRef={createRef<HTMLButtonElement>()} onClose={onClose} onRetry={vi.fn()} onCreate={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

it("retries a failed day load and includes the weekday", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<CalendarDayDrawer open localDate="2026-09-27" summary={null} loading={false} error="读取失败" busy={false} triggerRef={createRef<HTMLButtonElement>()} onClose={vi.fn()} onRetry={onRetry} onCreate={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: /2026年9月27日星期日安排/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重新加载当天安排" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it("keeps typed text when adding a task fails", async () => {
  const user = userEvent.setup();
  const summary: DashboardSummary = { tasks: [], completedTasks: 0, totalTasks: 0, todaySeconds: 0, timer: null, streakDays: 0, trend: [] };
  render(<CalendarDayDrawer open localDate="2026-09-27" summary={summary} loading={false} error="" busy={false} triggerRef={createRef<HTMLButtonElement>()} onClose={vi.fn()} onRetry={vi.fn()} onCreate={vi.fn().mockRejectedValue(new Error("保存失败"))} onToggle={vi.fn()} onDelete={vi.fn()} />);
  const input = screen.getByLabelText("新增当天待办");
  await user.type(input, "作文默写");
  await user.click(screen.getByRole("button", { name: "添加" }));
  expect(input).toHaveValue("作文默写");
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
