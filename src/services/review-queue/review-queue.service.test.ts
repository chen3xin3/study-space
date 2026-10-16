import { describe, expect, it, vi } from "vitest";
import type { DailyTask } from "../dashboard/dashboard.types";
import type { LearningItem, LearningItemService } from "../learning-items/learning-item.types";
import type { VocabularyService } from "../vocabulary/vocabulary.types";
import { createReviewQueueService } from "./review-queue.service";

const now = new Date("2026-10-10T12:00:00+08:00");

function learningItem(id: string, reviewAt: string | null, overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id,
    subject: "math",
    collection: "wrong-questions",
    kind: "question",
    title: id,
    content: "题目",
    answer: "解法",
    tags: [],
    mastery: "learning",
    source: "",
    score: null,
    maxScore: null,
    reviewAt,
    favorite: false,
    lastOpenedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

function dailyTask(id: string, completedAt: string | null = null): DailyTask {
  return {
    id,
    localDate: "2026-10-10",
    title: id,
    position: 0,
    completedAt,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
    version: 1,
  };
}

function createDependencies(items: LearningItem[]) {
  const vocabularyService = {
    getSummary: vi.fn().mockResolvedValue({ dueToday: 3 }),
  } as unknown as VocabularyService;
  const learningItemService = {
    list: vi.fn().mockResolvedValue(items),
  } as unknown as LearningItemService;
  return { vocabularyService, learningItemService };
}

describe("review queue service", () => {
  it("includes overdue and today items but excludes future and unscheduled items", async () => {
    const dependencies = createDependencies([
      learningItem("overdue", "2026-10-09"),
      learningItem("today", "2026-10-10"),
      learningItem("future", "2026-10-11"),
      learningItem("unscheduled", null),
    ]);
    const service = createReviewQueueService(dependencies);

    const result = await service.load({
      now,
      tasks: [dailyTask("one"), dailyTask("two"), dailyTask("done", "2026-10-10T05:00:00.000Z")],
    });

    expect(result.dueLearningItems.map((item) => item.id)).toEqual(["overdue", "today"]);
    expect(result.pendingTasks.map((item) => item.id)).toEqual(["one", "two"]);
    expect(result.totalDue).toBe(7);
    expect(result.dueMathWrongQuestions).toBe(2);
    expect(result.dueOtherLearningItems).toBe(0);
    expect(result.nextHref).toBe("/english/review");
    expect(result.failures).toEqual([]);
  });

  it("keeps available review sources when vocabulary loading fails", async () => {
    const dependencies = createDependencies([
      learningItem("math", "2026-10-10"),
      learningItem("politics", "2026-10-08", { subject: "politics", collection: "recitation" }),
    ]);
    vi.mocked(dependencies.vocabularyService.getSummary).mockRejectedValue(new Error("offline"));
    const service = createReviewQueueService(dependencies);

    const result = await service.load({ now, tasks: [] });

    expect(result.dueLearningItems).toHaveLength(2);
    expect(result.dueWords).toBe(0);
    expect(result.totalDue).toBe(2);
    expect(result.nextHref).toBe("/study/math/wrong-questions/math/review");
    expect(result.failures).toEqual(["words"]);
  });

  it("keeps word and task counts when learning items fail", async () => {
    const dependencies = createDependencies([]);
    vi.mocked(dependencies.learningItemService.list).mockRejectedValue(new Error("database busy"));
    const service = createReviewQueueService(dependencies);

    const result = await service.load({ now, tasks: [dailyTask("one")] });

    expect(result.totalDue).toBe(4);
    expect(result.nextHref).toBe("/english/review");
    expect(result.failures).toEqual(["learning-items"]);
  });
});
