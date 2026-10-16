import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import type { ImportCandidate, ImportSessionDetail, VocabularyImportService } from "../../services/vocabulary-import/vocabulary-import.types";
import { VocabularyImportReviewPage } from "./VocabularyImportReviewPage";

const candidate: ImportCandidate = {
  id: "candidate-1",
  word: "persist",
  meaningOrNote: "坚持",
  confidence: "uncertain",
  sourceAttachmentId: "image-1",
  sourceLine: 1,
  selected: true,
  resolution: null,
  createdAt: "now",
  updatedAt: "now",
  version: 1,
};

const session: ImportSessionDetail = {
  id: "session-1",
  status: "reviewing",
  errorCode: null,
  images: [{ attachmentId: "image-1", originalName: "words.jpg", mediaType: "image/jpeg", byteSize: 1024, sortOrder: 0, rotationDegrees: 0 }],
  candidates: [candidate],
  createdAt: "now",
  updatedAt: "now",
  completedAt: null,
  deletedAt: null,
  version: 1,
};

it("blocks saving until uncertain and duplicate candidates are resolved", async () => {
  const user = userEvent.setup();
  const service = {
    getSession: vi.fn().mockResolvedValue(session),
    previewDuplicates: vi.fn().mockResolvedValue([{ candidateId: "candidate-1", word: "persist", existingWordId: "word-1", existingDeleted: false, existingMeanings: ["坚持"], sameBatchCandidateIds: [] }]),
    updateCandidate: vi.fn().mockImplementation(async (input) => ({ ...candidate, ...input, version: 2 })),
    commit: vi.fn().mockResolvedValue({ created: 0, appended: 1, restored: 0, skipped: 0, failed: 0 }),
  } as unknown as VocabularyImportService;

  render(<MemoryRouter initialEntries={["/english/words/import/session-1"]}><Routes><Route path="/english/words/import/:sessionId" element={<VocabularyImportReviewPage service={service} />} /></Routes></MemoryRouter>);

  expect(await screen.findByText("words.jpg")).toBeInTheDocument();
  const save = screen.getByRole("button", { name: "确认并保存到单词本" });
  expect(save).toBeDisabled();
  await user.selectOptions(await screen.findByLabelText("处理重复词 persist"), "append_meaning");
  expect(save).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "待确认" }));
  await waitFor(() => expect(save).toBeEnabled());
  await user.click(save);

  expect(service.commit).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: "session-1",
    items: [expect.objectContaining({ candidateId: "candidate-1", candidateVersion: 2, resolution: "append_meaning" })],
  }));
  expect(await screen.findByRole("heading", { name: "录入完成" })).toBeInTheDocument();
});
