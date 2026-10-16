import { createLearningItemService } from "../learning-items/learning-item.service";
import type { LearningItem, LearningItemService } from "../learning-items/learning-item.types";
import { createVocabularyService } from "../vocabulary/vocabulary.service";
import type { VocabularyService } from "../vocabulary/vocabulary.types";
import type { ReviewQueueService, ReviewQueueSummary, ReviewSource } from "./review-queue.types";

interface ReviewQueueDependencies {
  vocabularyService: VocabularyService;
  learningItemService: LearningItemService;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDue(item: LearningItem, today: string): boolean {
  return item.deletedAt === null && Boolean(item.reviewAt) && item.reviewAt!.slice(0, 10) <= today;
}

function nextReviewHref(dueWords: number, dueItems: LearningItem[], pendingTaskTitle?: string): string | null {
  if (dueWords > 0) return "/english/review";
  const mathWrongQuestion = dueItems.find((item) => item.subject === "math" && item.collection === "wrong-questions");
  if (mathWrongQuestion) return `/study/math/wrong-questions/${mathWrongQuestion.id}/review`;
  const nextItem = dueItems[0];
  if (nextItem) return `/study/${nextItem.subject}/${nextItem.collection}/${nextItem.id}`;
  if (pendingTaskTitle) return `/focus?${new URLSearchParams({ goal: pendingTaskTitle })}`;
  return null;
}

export function createReviewQueueService(
  dependencies: ReviewQueueDependencies = {
    vocabularyService: createVocabularyService(),
    learningItemService: createLearningItemService(),
  },
): ReviewQueueService {
  return {
    async load({ now, tasks }): Promise<ReviewQueueSummary> {
      const [wordsResult, itemsResult] = await Promise.allSettled([
        dependencies.vocabularyService.getSummary(),
        dependencies.learningItemService.list({ trash: false }),
      ]);
      const failures: ReviewSource[] = [];
      const dueWords = wordsResult.status === "fulfilled" ? wordsResult.value.dueToday : 0;
      if (wordsResult.status === "rejected") failures.push("words");
      const allItems = itemsResult.status === "fulfilled" ? itemsResult.value : [];
      if (itemsResult.status === "rejected") failures.push("learning-items");

      const dueLearningItems = allItems.filter((item) => isDue(item, localDateKey(now)));
      const pendingTasks = tasks.filter((task) => !task.completedAt);
      const dueMathWrongQuestions = dueLearningItems.filter(
        (item) => item.subject === "math" && item.collection === "wrong-questions",
      ).length;
      const dueOtherLearningItems = dueLearningItems.length - dueMathWrongQuestions;

      return {
        pendingTasks,
        dueWords,
        dueLearningItems,
        dueMathWrongQuestions,
        dueOtherLearningItems,
        totalDue: pendingTasks.length + dueWords + dueLearningItems.length,
        nextHref: nextReviewHref(dueWords, dueLearningItems, pendingTasks[0]?.title),
        failures,
      };
    },
  };
}

export type { ReviewQueueService, ReviewQueueSummary } from "./review-queue.types";
