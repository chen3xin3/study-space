export type ExamTrack = "english_1" | "english_2";
export type EssayType = "small" | "large" | "custom";
export type AttemptMode = "independent" | "dictation";
export type AttemptStatus = "draft" | "completed";
export type EssayImportDraftStage = "draft" | "review" | "failed";

export interface EssayCategory { id: string; name: string; version: number }
export interface EssayExpression {
  id: string;
  expression: string;
  explanation: string | null;
  sortOrder: number;
  version: number;
}
export interface EssayTag { id: string; name: string }
export interface ExpressionInput { expression: string; explanation: string | null }

export interface CreateEssayInput {
  sourcePhotoIds?: string[];
  title: string;
  body: string;
  translation: string | null;
  examTrack: ExamTrack | null;
  essayType: EssayType;
  source: string | null;
  note: string | null;
  category: string | null;
  expressions: ExpressionInput[];
  tags: string[];
}

export interface UpdateEssayInput extends CreateEssayInput {
  id: string;
  version: number;
}

export interface EssayDetail {
  sourcePhotoIds?: string[];
  id: string;
  title: string;
  body: string;
  translation: string | null;
  examTrack: ExamTrack | null;
  essayType: EssayType;
  source: string | null;
  note: string | null;
  category: EssayCategory | null;
  expressions: EssayExpression[];
  tags: EssayTag[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface EssayListQuery {
  search: string | null;
  category: string | null;
  tag: string | null;
  examTrack: ExamTrack | null;
  essayType: EssayType | null;
  cursor: string | null;
  limit: number | null;
}

export interface EssayListItem {
  id: string;
  title: string;
  excerpt: string;
  examTrack: ExamTrack | null;
  essayType: EssayType;
  category: EssayCategory | null;
  tags: EssayTag[];
  updatedAt: string;
  version: number;
}
export interface EssayListPage { items: EssayListItem[]; nextCursor: string | null }

export interface CreateAttemptInput {
  mode: AttemptMode;
  sourceEssayId: string | null;
  title: string;
  prompt: string | null;
  scoringCriteria: string | null;
  body: string;
  note: string | null;
  examTrack: ExamTrack | null;
  essayType: EssayType;
  attachmentIds: string[];
}
export interface UpdateAttemptInput extends Omit<CreateAttemptInput, "mode" | "sourceEssayId"> {
  id: string;
  version: number;
}
export interface AttemptDetail extends CreateAttemptInput {
  id: string;
  status: AttemptStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface AttemptListPage { items: AttemptDetail[]; nextCursor: string | null }
export interface DictationChange { kind: string; expected: string; actual: string }
export interface DictationComparison {
  changedSegments: number;
  changes: DictationChange[];
}
export interface EssaySummary {
  essayCount: number;
  draftCount: number;
  writingCount: number;
  lastAiReviewAt: string | null;
}

export interface EssayImportDraft {
  id: string;
  stage: EssayImportDraftStage;
  title: string;
  body: string;
  translation: string;
  examTrack: ExamTrack | null;
  essayType: EssayType;
  attachmentIds: string[];
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface UpdateEssayImportDraftInput {
  id: string;
  version: number;
  stage: EssayImportDraftStage;
  title: string;
  body: string;
  translation: string;
  examTrack: ExamTrack | null;
  essayType: EssayType;
  lastError: string | null;
}

export interface EssayService {
  createEssay(input: CreateEssayInput): Promise<EssayDetail>;
  getEssay(essayId: string): Promise<EssayDetail>;
  listEssays(query: EssayListQuery): Promise<EssayListPage>;
  updateEssay(input: UpdateEssayInput): Promise<EssayDetail>;
  deleteEssays(essayIds: string[]): Promise<number>;
  createAttempt(input: CreateAttemptInput): Promise<AttemptDetail>;
  getAttempt(attemptId: string): Promise<AttemptDetail>;
  updateAttempt(input: UpdateAttemptInput): Promise<AttemptDetail>;
  completeAttempt(attemptId: string, version: number): Promise<AttemptDetail>;
  copyAttempt(sourceId: string, title: string): Promise<AttemptDetail>;
  listAttempts(cursor: string | null, limit: number): Promise<AttemptListPage>;
  compareDictation(expected: string, actual: string): Promise<DictationComparison>;
  getSummary(): Promise<EssaySummary>;
  createImportDraft(): Promise<EssayImportDraft>;
  getImportDraft(draftId: string): Promise<EssayImportDraft>;
  listImportDrafts(): Promise<EssayImportDraft[]>;
  addImportDraftImage(draftId: string, version: number, bytes: number[], mediaType: string): Promise<EssayImportDraft>;
  removeImportDraftImage(draftId: string, version: number, attachmentId: string): Promise<EssayImportDraft>;
  updateImportDraft(input: UpdateEssayImportDraftInput): Promise<EssayImportDraft>;
  abandonImportDraft(draftId: string, version: number): Promise<void>;
  completeImportDraft(input: UpdateEssayImportDraftInput): Promise<EssayDetail>;
}
