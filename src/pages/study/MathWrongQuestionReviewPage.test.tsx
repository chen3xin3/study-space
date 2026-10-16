import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { buildWrongQuestionReviewUpdate, MathWrongQuestionReviewPage } from "./MathWrongQuestionReviewPage";
import { fakeLearningService, learningItem } from "./study-test-helpers";

const now = new Date("2026-10-10T12:00:00+08:00");

function renderPage(service = fakeLearningService([learningItem()])) {
  return render(
    <MemoryRouter initialEntries={["/study/math/wrong-questions/item-1/review"]}>
      <Routes>
        <Route path="/study/math/wrong-questions/:itemId/review" element={<MathWrongQuestionReviewPage service={service} now={now} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("math wrong-question review", () => {
  it.each([
    ["again", "learning", "2026-10-11"],
    ["fuzzy", "familiar", "2026-10-13"],
    ["mastered", "mastered", "2026-10-17"],
  ] as const)("maps %s to its mastery and next review date", (rating, mastery, reviewAt) => {
    const item = learningItem();
    expect(buildWrongQuestionReviewUpdate(item, rating, now)).toMatchObject({
      id: item.id,
      version: item.version,
      title: item.title,
      content: item.content,
      answer: item.answer,
      mastery,
      reviewAt,
    });
  });

  it("keeps the solution hidden until the learner asks for it", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "极限计算" })).toBeInTheDocument();
    expect(screen.getByText("求一个重要极限")).toBeInTheDocument();
    expect(screen.queryByText("洛必达法则")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "仍不会" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "查看解法" }));
    expect(screen.getByText("洛必达法则")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "仍不会" })).toBeEnabled();
  });

  it("updates mastery and keeps the revealed solution visible on conflicts", async () => {
    const service = fakeLearningService([learningItem()]);
    const user = userEvent.setup();
    const view = renderPage(service);
    await user.click(await screen.findByRole("button", { name: "查看解法" }));
    await user.click(screen.getByRole("button", { name: "有点模糊" }));
    expect(service.update).toHaveBeenCalledWith(expect.objectContaining({ mastery: "familiar", reviewAt: "2026-10-13" }));
    expect(await screen.findByRole("status")).toHaveTextContent("已安排 3 天后复习");

    view.unmount();
    const conflictService = fakeLearningService([learningItem()]);
    vi.mocked(conflictService.update).mockRejectedValue(new Error("内容已发生变化，请重新载入"));
    renderPage(conflictService);
    await user.click(await screen.findByRole("button", { name: "查看解法" }));
    await user.click(screen.getByRole("button", { name: "已掌握" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("内容已发生变化，请重新载入");
    expect(screen.getByText("洛必达法则")).toBeInTheDocument();
  });
});
