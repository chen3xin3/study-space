import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ReviewQueueSummary } from "../../services/review-queue/review-queue.types";
import { TodayReviewCard } from "./TodayReviewCard";

function summary(overrides: Partial<ReviewQueueSummary> = {}): ReviewQueueSummary {
  return {
    pendingTasks: [],
    dueWords: 0,
    dueLearningItems: [],
    dueMathWrongQuestions: 0,
    dueOtherLearningItems: 0,
    totalDue: 0,
    nextHref: null,
    failures: [],
    ...overrides,
  };
}

describe("TodayReviewCard", () => {
  it("shows real review counts and the next available entry", () => {
    render(
      <MemoryRouter>
        <TodayReviewCard
          summary={summary({ dueWords: 2, dueMathWrongQuestions: 2, dueOtherLearningItems: 1, totalDue: 5, nextHref: "/english/review" })}
          loading={false}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "今日复习" })).toBeInTheDocument();
    expect(screen.getByText("5 项待处理")).toBeInTheDocument();
    expect(screen.getByText("单词 2")).toBeInTheDocument();
    expect(screen.getByText("数学错题 2")).toBeInTheDocument();
    expect(screen.getByText("其他复习 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始复习" })).toHaveAttribute("href", "/english/review");
  });

  it("shows a quiet completion state without an empty action", () => {
    render(<MemoryRouter><TodayReviewCard summary={summary()} loading={false} onRetry={vi.fn()} /></MemoryRouter>);

    expect(screen.getByText("今天的复习已完成")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "开始复习" })).not.toBeInTheDocument();
  });

  it("keeps available data visible and retries a failed source", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TodayReviewCard
          summary={summary({ dueMathWrongQuestions: 1, totalDue: 1, nextHref: "/study/math/wrong-questions/q1/review", failures: ["words"] })}
          loading={false}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("部分复习内容暂未载入")).toBeInTheDocument();
    expect(screen.getByText("数学错题 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试复习数据" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
