import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import type { VocabularyService, WordDetail } from "../../services/vocabulary/vocabulary.types";
import { WordEditorPage } from "./WordEditorPage";
import { WordLibraryPage } from "./WordLibraryPage";

const detail: WordDetail = {
  id: "word-1",
  displayText: "persist",
  phonetic: null,
  partOfSpeech: "verb",
  exampleSentence: null,
  note: null,
  meanings: [{ id: "meaning-1", meaning: "坚持", version: 1 }],
  tags: [{ id: "tag-1", name: "核心" }],
  reviewState: {
    nextReviewAt: "2026-09-26T01:00:00Z",
    intervalDays: 0,
    lastResult: null,
    reviewCount: 0,
    lapseCount: 0,
    version: 1,
  },
  createdAt: "2026-09-25T02:00:00Z",
  updatedAt: "2026-09-25T02:00:00Z",
  deletedAt: null,
  version: 1,
};

function service(overrides: Partial<VocabularyService> = {}): VocabularyService {
  return {
    createWord: vi.fn(),
    resolveDuplicate: vi.fn(),
    getWord: vi.fn().mockResolvedValue(detail),
    listWords: vi.fn().mockResolvedValue({
      items: [{
        id: detail.id,
        displayText: detail.displayText,
        primaryMeaning: "坚持",
        tags: detail.tags,
        nextReviewAt: detail.reviewState!.nextReviewAt,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        deletedAt: null,
        version: 1,
      }],
      nextCursor: null,
    }),
    updateWord: vi.fn().mockResolvedValue({ ...detail, version: 2 }),
    deleteWords: vi.fn().mockResolvedValue({ requested: 1, changed: 1, skipped: 0 }),
    updateWordTags: vi.fn().mockResolvedValue({ requested: 1, changed: 1, skipped: 0 }),
    scheduleWordsForToday: vi.fn().mockResolvedValue({ requested: 1, changed: 1, skipped: 0 }),
    getReviewQueue: vi.fn(),
    submitReview: vi.fn(),
    rescheduleReview: vi.fn(),
    getSummary: vi.fn(),
    ...overrides,
  };
}

it("debounces search and supports selecting and scheduling a word", async () => {
  const user = userEvent.setup();
  const api = service();
  render(<MemoryRouter><WordLibraryPage service={api} /></MemoryRouter>);
  expect(screen.getByRole("search", { name: "筛选单词" })).toBeInTheDocument();
  expect(await screen.findByText("persist")).toBeInTheDocument();

  await user.type(screen.getByLabelText("搜索单词"), "per");
  await waitFor(
    () => expect(api.listWords).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "per" }),
    ),
    { timeout: 1000 },
  );

  await user.click(screen.getByRole("checkbox", { name: "选择 persist" }));
  await user.click(screen.getByRole("button", { name: "今天复习" }));
  expect(api.scheduleWordsForToday).toHaveBeenCalledWith(
    ["word-1"],
    expect.any(String),
  );
});

it("requires confirmation before a batch delete", async () => {
  const user = userEvent.setup();
  const api = service();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<MemoryRouter><WordLibraryPage service={api} /></MemoryRouter>);
  await screen.findByText("persist");
  await user.click(screen.getByRole("checkbox", { name: "选择 persist" }));
  await user.click(screen.getByRole("button", { name: "删除所选" }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1"));
  expect(api.deleteWords).toHaveBeenCalledWith(["word-1"]);
  confirm.mockRestore();
});

it("loads and saves the editor with its current version", async () => {
  const user = userEvent.setup();
  const api = service();
  render(
    <MemoryRouter initialEntries={["/english/words/word-1"]}>
      <Routes>
        <Route path="/english/words/:wordId" element={<WordEditorPage service={api} />} />
      </Routes>
    </MemoryRouter>,
  );
  const input = await screen.findByLabelText("英文单词");
  await user.clear(input);
  await user.type(input, "persistent");
  await user.click(screen.getByRole("button", { name: "保存修改" }));
  expect(api.updateWord).toHaveBeenCalledWith(
    expect.objectContaining({ id: "word-1", version: 1, word: "persistent" }),
  );
});
