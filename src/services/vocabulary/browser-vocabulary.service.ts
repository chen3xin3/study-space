import { VocabularyServiceError } from "./vocabulary.errors";
import type {
  CreateWordInput,
  RescheduleReviewInput,
  ResolveDuplicateInput,
  ReviewQueueQuery,
  SubmitReviewInput,
  UpdateWordInput,
  UpdateWordTagsInput,
  VocabularyService,
  WordListQuery,
} from "./vocabulary.types";

export class BrowserVocabularyService implements VocabularyService {
  createWord(_input: CreateWordInput): Promise<never> { return this.reject(); }
  resolveDuplicate(_input: ResolveDuplicateInput): Promise<never> { return this.reject(); }
  getWord(_wordId: string): Promise<never> { return this.reject(); }
  listWords(_query: WordListQuery): Promise<never> { return this.reject(); }
  updateWord(_input: UpdateWordInput): Promise<never> { return this.reject(); }
  deleteWords(_wordIds: string[]): Promise<never> { return this.reject(); }
  updateWordTags(_input: UpdateWordTagsInput): Promise<never> { return this.reject(); }
  scheduleWordsForToday(_wordIds: string[], _nextReviewAt: string): Promise<never> {
    return this.reject();
  }
  getReviewQueue(_query: ReviewQueueQuery): Promise<never> { return this.reject(); }
  submitReview(_input: SubmitReviewInput): Promise<never> { return this.reject(); }
  rescheduleReview(_input: RescheduleReviewInput): Promise<never> { return this.reject(); }
  getSummary(): Promise<never> { return this.reject(); }

  private reject(): Promise<never> {
    return Promise.reject(
      new VocabularyServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中使用。"),
    );
  }
}
