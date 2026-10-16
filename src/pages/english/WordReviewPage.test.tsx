import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { VocabularyService } from "../../services/vocabulary/vocabulary.types";
import { WordReviewPage } from "./WordReviewPage";

function service(submitReview = vi.fn().mockResolvedValue({
  wordId: "word-1",
  nextReviewAt: "2026-09-28T02:00:00Z",
  intervalDays: 3,
  reviewStateVersion: 2,
})): VocabularyService {
  return {
    createWord: vi.fn(),
    resolveDuplicate: vi.fn(),
    getWord: vi.fn(),
    listWords: vi.fn(),
    updateWord: vi.fn(),
    deleteWords: vi.fn(),
    updateWordTags: vi.fn(),
    scheduleWordsForToday: vi.fn(),
    getReviewQueue: vi.fn().mockResolvedValue([{
      wordId: "word-1",
      prompt: "persist",
      answer: "坚持",
      meanings: ["坚持"],
      direction: "en_to_zh",
      reviewStateVersion: 1,
      promptedAt: "2026-09-25T02:00:00Z",
    }]),
    submitReview,
    rescheduleReview: vi.fn(),
    getSummary: vi.fn(),
  };
}

it("requires answer reveal before submitting a review result", async () => {
  const user = userEvent.setup();
  const api = service();
  render(<MemoryRouter><WordReviewPage service={api} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "开始复习" }));
  expect(await screen.findByText("persist")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^认识/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "显示答案" }));
  expect(screen.getByText("坚持")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^认识/ }));
  expect(api.submitReview).toHaveBeenCalledWith(
    expect.objectContaining({ wordId: "word-1", result: "known" }),
  );
  expect(await screen.findByText("本轮复习完成")).toBeInTheDocument();
});

it("keeps the current card when saving a result fails", async () => {
  const user = userEvent.setup();
  const submit = vi.fn().mockRejectedValue(new Error("保存失败"));
  render(<MemoryRouter><WordReviewPage service={service(submit)} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "开始复习" }));
  await screen.findByText("persist");
  await user.keyboard(" ");
  expect(screen.getByText("坚持")).toBeInTheDocument();
  await user.keyboard("2");
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.getByText("persist")).toBeInTheDocument();
});
