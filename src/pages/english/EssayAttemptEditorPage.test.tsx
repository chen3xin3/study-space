import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import type { AttemptDetail, EssayService } from "../../services/essays/essay.types";
import { EssayAttemptEditorPage } from "./EssayAttemptEditorPage";

const openAttempt: AttemptDetail = {
  id: "attempt-1", status: "draft", title: "图表作文练习", body: "Initial body", mode: "independent",
  sourceEssayId: null, prompt: "Write about the chart", scoringCriteria: null, note: null,
  examTrack: "english_1", essayType: "large", attachmentIds: [], completedAt: null,
  createdAt: "now", updatedAt: "now", version: 1,
};

it("saves edits with the current version and completes the writing attempt", async () => {
  const user = userEvent.setup();
  const service = {
    getAttempt: vi.fn().mockResolvedValue(openAttempt),
    updateAttempt: vi.fn().mockResolvedValue({ ...openAttempt, body: "Revised body", version: 2 }),
    completeAttempt: vi.fn().mockResolvedValue({ ...openAttempt, body: "Revised body", status: "completed", completedAt: "later", version: 3 }),
  } as unknown as EssayService;
  render(
    <MemoryRouter initialEntries={["/english/essays/history/attempt-1"]}>
      <Routes><Route path="/english/essays/history/:attemptId" element={<EssayAttemptEditorPage service={service} />} /></Routes>
    </MemoryRouter>,
  );

  const body = await screen.findByLabelText("作文正文");
  await user.clear(body);
  await user.type(body, "Revised body");
  await user.click(screen.getByRole("button", { name: "保存进度" }));
  expect(service.updateAttempt).toHaveBeenCalledWith(expect.objectContaining({ id: "attempt-1", version: 1, body: "Revised body" }));

  await user.click(screen.getByRole("button", { name: "完成练习" }));
  expect(service.completeAttempt).toHaveBeenCalledWith("attempt-1", 2);
  expect(await screen.findByText("已完成")).toBeInTheDocument();
});
