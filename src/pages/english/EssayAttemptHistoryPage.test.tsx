import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { AttemptDetail, EssayService } from "../../services/essays/essay.types";
import { EssayAttemptHistoryPage } from "./EssayAttemptHistoryPage";

function attempt(id: string, status: AttemptDetail["status"], title: string): AttemptDetail {
  return {
    id, status, title, body: `${title} body`, mode: "independent", sourceEssayId: null,
    prompt: null, scoringCriteria: null, note: null, examTrack: null, essayType: "custom",
    attachmentIds: [], completedAt: status === "completed" ? "2026-10-04T08:00:00Z" : null,
    createdAt: "2026-10-04T07:00:00Z", updatedAt: "2026-10-04T08:00:00Z", version: 1,
  };
}

it("shows draft and completed writing attempts and loads the next page", async () => {
  const user = userEvent.setup();
  const service = {
    listAttempts: vi.fn()
      .mockResolvedValueOnce({ items: [attempt("draft-1", "draft", "第一次练习"), attempt("done-1", "completed", "第二次练习")], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [attempt("done-2", "completed", "第三次练习")], nextCursor: null }),
  } as unknown as EssayService;
  render(<MemoryRouter><EssayAttemptHistoryPage service={service} /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "写作记录" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /第一次练习.*未完成/ })).toHaveAttribute("href", "/english/essays/history/draft-1");
  expect(screen.getByRole("link", { name: /第二次练习.*已完成/ })).toHaveAttribute("href", "/english/essays/history/done-1");
  await user.click(screen.getByRole("button", { name: "加载更多" }));
  expect(await screen.findByRole("link", { name: /第三次练习.*已完成/ })).toBeInTheDocument();
  expect(service.listAttempts).toHaveBeenNthCalledWith(2, "next", 30);
});
