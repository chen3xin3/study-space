export interface CreateWordInput {
  word: string;
  meaning: string;
  phonetic: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  note: string | null;
  tags: string[];
}

export interface WordMeaning {
  id: string;
  meaning: string;
  version: number;
}

export interface WordTag {
  id: string;
  name: string;
}

export type ReviewDirection = "en_to_zh" | "zh_to_en";
export type ReviewResult = "known" | "fuzzy" | "unknown";

export interface WordReviewState {
  nextReviewAt: string;
  intervalDays: number;
  lastResult: ReviewResult | null;
  reviewCount: number;
  lapseCount: number;
  version: number;
}

export interface WordDetail {
  id: string;
  displayText: string;
  phonetic: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  note: string | null;
  meanings: WordMeaning[];
  tags: WordTag[];
  reviewState: WordReviewState | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type CreateWordOutcome =
  | { status: "created"; word: WordDetail }
  | { status: "duplicate"; word: WordDetail; deleted: boolean };

export type DuplicateResolution =
  | { action: "encounterOnly" }
  | { action: "appendMeaning"; meaning: string }
  | { action: "restoreAndAppend"; meaning: string | null };

export interface ResolveDuplicateInput {
  wordId: string;
  resolution: DuplicateResolution;
}

export type WordReviewFilter = "due" | "neverReviewed" | "scheduled";
export type WordSort = "newest" | "alphabetical" | "nextReview";

export interface WordListQuery {
  search: string | null;
  tag: string | null;
  reviewStatus: WordReviewFilter | null;
  createdFrom: string | null;
  createdTo: string | null;
  includeDeleted: boolean;
  sort: WordSort;
  cursor: string | null;
  limit: number | null;
  now: string;
}

export interface WordListItem {
  id: string;
  displayText: string;
  primaryMeaning: string | null;
  tags: WordTag[];
  nextReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface WordListPage {
  items: WordListItem[];
  nextCursor: string | null;
}

export interface UpdateWordInput {
  id: string;
  version: number;
  word: string;
  meanings: string[];
  phonetic: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  note: string | null;
  tags: string[];
}

export interface UpdateWordTagsInput {
  wordIds: string[];
  add: string[];
  remove: string[];
}

export interface BatchResult {
  requested: number;
  changed: number;
  skipped: number;
}

export interface ReviewQueueQuery {
  direction: ReviewDirection;
  limit: number | null;
  wordIds: string[];
  now: string;
}

export interface ReviewCard {
  wordId: string;
  prompt: string;
  answer: string;
  meanings: string[];
  direction: ReviewDirection;
  reviewStateVersion: number;
  promptedAt: string;
}

export interface SubmitReviewInput {
  wordId: string;
  direction: ReviewDirection;
  result: ReviewResult;
  reviewStateVersion: number;
  promptedAt: string;
  answerRevealedAt: string | null;
  submittedAt: string;
  localDayStart: string;
  localDayEnd: string;
  nextLocalDayNineUtc: string;
}

export interface RescheduleReviewInput {
  wordId: string;
  reviewStateVersion: number;
  nextReviewAt: string;
  updatedAt: string;
}

export interface ReviewSubmission {
  wordId: string;
  nextReviewAt: string;
  intervalDays: number;
  reviewStateVersion: number;
}

export interface EnglishSummary {
  totalWords: number;
  learnedToday: number;
  dueToday: number;
  reviewedToday: number;
  learnedThisWeek: number;
  knownThisWeek: number;
  fuzzyThisWeek: number;
  unknownThisWeek: number;
}

export interface VocabularyService {
  createWord(input: CreateWordInput): Promise<CreateWordOutcome>;
  resolveDuplicate(input: ResolveDuplicateInput): Promise<WordDetail>;
  getWord(wordId: string): Promise<WordDetail>;
  listWords(query: WordListQuery): Promise<WordListPage>;
  updateWord(input: UpdateWordInput): Promise<WordDetail>;
  deleteWords(wordIds: string[]): Promise<BatchResult>;
  updateWordTags(input: UpdateWordTagsInput): Promise<BatchResult>;
  scheduleWordsForToday(wordIds: string[], nextReviewAt: string): Promise<BatchResult>;
  getReviewQueue(query: ReviewQueueQuery): Promise<ReviewCard[]>;
  submitReview(input: SubmitReviewInput): Promise<ReviewSubmission>;
  rescheduleReview(input: RescheduleReviewInput): Promise<ReviewSubmission>;
  getSummary(): Promise<EnglishSummary>;
}
