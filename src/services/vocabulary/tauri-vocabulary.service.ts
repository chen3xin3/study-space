import { invoke } from "@tauri-apps/api/core";
import { toVocabularyServiceError } from "./vocabulary.errors";
import type {
  BatchResult,
  CreateWordInput,
  CreateWordOutcome,
  EnglishSummary,
  RescheduleReviewInput,
  ResolveDuplicateInput,
  ReviewCard,
  ReviewQueueQuery,
  ReviewSubmission,
  SubmitReviewInput,
  UpdateWordInput,
  UpdateWordTagsInput,
  VocabularyService,
  WordDetail,
  WordListPage,
  WordListQuery,
} from "./vocabulary.types";

export class TauriVocabularyService implements VocabularyService {
  createWord(input: CreateWordInput) {
    return this.run(() => invoke<CreateWordOutcome>("create_word", { input }));
  }
  resolveDuplicate(input: ResolveDuplicateInput) {
    return this.run(() => invoke<WordDetail>("resolve_duplicate_word", { input }));
  }
  getWord(wordId: string) {
    return this.run(() => invoke<WordDetail>("get_word", { wordId }));
  }
  listWords(query: WordListQuery) {
    return this.run(() => invoke<WordListPage>("list_words", { query }));
  }
  updateWord(input: UpdateWordInput) {
    return this.run(() => invoke<WordDetail>("update_word", { input }));
  }
  deleteWords(wordIds: string[]) {
    return this.run(() =>
      invoke<BatchResult>("delete_words", { input: { wordIds } }),
    );
  }
  updateWordTags(input: UpdateWordTagsInput) {
    return this.run(() => invoke<BatchResult>("update_word_tags", { input }));
  }
  scheduleWordsForToday(wordIds: string[], nextReviewAt: string) {
    return this.run(() =>
      invoke<BatchResult>("schedule_words_for_today", {
        input: { wordIds, nextReviewAt },
      }),
    );
  }
  getReviewQueue(query: ReviewQueueQuery) {
    return this.run(() =>
      invoke<ReviewCard[]>("get_word_review_queue", { query }),
    );
  }
  submitReview(input: SubmitReviewInput) {
    return this.run(() =>
      invoke<ReviewSubmission>("submit_word_review", { input }),
    );
  }
  rescheduleReview(input: RescheduleReviewInput) {
    return this.run(() =>
      invoke<ReviewSubmission>("reschedule_word_review", { input }),
    );
  }
  getSummary() {
    return this.run(() => invoke<EnglishSummary>("get_english_summary"));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toVocabularyServiceError(error);
    }
  }
}
