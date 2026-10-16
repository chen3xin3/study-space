import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVocabularyService } from "./browser-vocabulary.service";
import { TauriVocabularyService } from "./tauri-vocabulary.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("TauriVocabularyService", () => {
  const service = new TauriVocabularyService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({});
  });

  it("invokes every desktop command with the exact argument envelope", async () => {
    const createInput = {
      word: "persist",
      meaning: "坚持",
      phonetic: null,
      partOfSpeech: null,
      exampleSentence: null,
      note: null,
      tags: [],
    };
    await service.createWord(createInput);
    expect(invoke).toHaveBeenLastCalledWith("create_word", { input: createInput });

    const duplicateInput = {
      wordId: "word-1",
      resolution: { action: "encounterOnly" as const },
    };
    await service.resolveDuplicate(duplicateInput);
    expect(invoke).toHaveBeenLastCalledWith("resolve_duplicate_word", {
      input: duplicateInput,
    });

    await service.getWord("word-1");
    expect(invoke).toHaveBeenLastCalledWith("get_word", { wordId: "word-1" });

    const listQuery = {
      search: null,
      tag: null,
      reviewStatus: null,
      createdFrom: null,
      createdTo: null,
      includeDeleted: false,
      sort: "newest" as const,
      cursor: null,
      limit: 50,
      now: "2026-09-25T02:00:00Z",
    };
    await service.listWords(listQuery);
    expect(invoke).toHaveBeenLastCalledWith("list_words", { query: listQuery });

    const updateInput = {
      id: "word-1",
      version: 1,
      word: "persist",
      meanings: ["坚持"],
      phonetic: null,
      partOfSpeech: null,
      exampleSentence: null,
      note: null,
      tags: [],
    };
    await service.updateWord(updateInput);
    expect(invoke).toHaveBeenLastCalledWith("update_word", { input: updateInput });

    await service.deleteWords(["word-1"]);
    expect(invoke).toHaveBeenLastCalledWith("delete_words", {
      input: { wordIds: ["word-1"] },
    });

    const tagsInput = { wordIds: ["word-1"], add: ["重点"], remove: [] };
    await service.updateWordTags(tagsInput);
    expect(invoke).toHaveBeenLastCalledWith("update_word_tags", {
      input: tagsInput,
    });

    await service.scheduleWordsForToday(["word-1"], "2026-09-25T02:00:00Z");
    expect(invoke).toHaveBeenLastCalledWith("schedule_words_for_today", {
      input: {
        wordIds: ["word-1"],
        nextReviewAt: "2026-09-25T02:00:00Z",
      },
    });

    const queueQuery = {
      direction: "en_to_zh" as const,
      limit: 10,
      wordIds: [],
      now: "2026-09-25T02:00:00Z",
    };
    await service.getReviewQueue(queueQuery);
    expect(invoke).toHaveBeenLastCalledWith("get_word_review_queue", {
      query: queueQuery,
    });

    const reviewInput = {
      wordId: "word-1",
      direction: "en_to_zh" as const,
      result: "known" as const,
      reviewStateVersion: 1,
      promptedAt: "2026-09-25T02:00:00Z",
      answerRevealedAt: "2026-09-25T02:00:02Z",
      submittedAt: "2026-09-25T02:00:03Z",
      localDayStart: "2026-09-24T16:00:00Z",
      localDayEnd: "2026-09-25T16:00:00Z",
      nextLocalDayNineUtc: "2026-09-26T01:00:00Z",
    };
    await service.submitReview(reviewInput);
    expect(invoke).toHaveBeenLastCalledWith("submit_word_review", {
      input: reviewInput,
    });

    const rescheduleInput = {
      wordId: "word-1",
      reviewStateVersion: 2,
      nextReviewAt: "2026-09-27T01:00:00Z",
      updatedAt: "2026-09-25T02:00:04Z",
    };
    await service.rescheduleReview(rescheduleInput);
    expect(invoke).toHaveBeenLastCalledWith("reschedule_word_review", {
      input: rescheduleInput,
    });

    await service.getSummary();
    expect(invoke).toHaveBeenLastCalledWith("get_english_summary");
  });

  it.each([
    ["WORD_INVALID", "单词信息不完整或格式不正确。"],
    ["WORD_NOT_FOUND", "没有找到这个单词。"],
    ["WORD_VERSION_CONFLICT", "这个单词已在其他位置更新，请重新读取后再保存。"],
    ["VOCABULARY_OPERATION_FAILED", "单词操作未能完成，请稍后重试。"],
  ])("maps %s to a stable Chinese message", async (code, message) => {
    vi.mocked(invoke).mockRejectedValue({ code, message: "raw", internal: "private" });
    await expect(service.getSummary()).rejects.toMatchObject({ code, message });
  });
});

it("browser preview never pretends that a word was saved", async () => {
  const service = new BrowserVocabularyService();
  await expect(
    service.createWord({
      word: "preview",
      meaning: "预览",
      phonetic: null,
      partOfSpeech: null,
      exampleSentence: null,
      note: null,
      tags: [],
    }),
  ).rejects.toMatchObject({
    code: "DESKTOP_ONLY",
    message: "请在 Windows 桌面版中使用。",
  });
});
