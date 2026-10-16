import type { DailyTask } from "../dashboard/dashboard.types";
import type { LearningItem } from "../learning-items/learning-item.types";

export type ReviewSource = "words" | "learning-items";

export interface ReviewQueueSummary {
  pendingTasks: DailyTask[];
  dueWords: number;
  dueLearningItems: LearningItem[];
  dueMathWrongQuestions: number;
  dueOtherLearningItems: number;
  totalDue: number;
  nextHref: string | null;
  failures: ReviewSource[];
}

export interface ReviewQueueService {
  load(input: { now: Date; tasks: DailyTask[] }): Promise<ReviewQueueSummary>;
}
