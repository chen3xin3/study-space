export type LearningSubject = "english" | "math" | "specialty" | "politics" | "other";
export type LearningItemKind = "note" | "question" | "material" | "practice" | "exam";
export type LearningMastery = "new" | "learning" | "familiar" | "mastered";

export interface LearningItem {
  id: string;
  subject: LearningSubject;
  collection: string;
  kind: LearningItemKind;
  title: string;
  content: string;
  answer: string;
  tags: string[];
  mastery: LearningMastery;
  source: string;
  score: number | null;
  maxScore: number | null;
  reviewAt: string | null;
  favorite: boolean;
  lastOpenedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type LearningItemDraft = Pick<LearningItem,
  "subject" | "collection" | "kind" | "title" | "content" | "answer" |
  "tags" | "mastery" | "source" | "score" | "maxScore" | "reviewAt">;

export interface LearningItemQuery {
  subject?: LearningSubject;
  collection?: string;
  kind?: LearningItemKind;
  mastery?: LearningMastery;
  search?: string;
  favorite?: boolean;
  trash?: boolean;
}

export interface LearningItemService {
  list(query: LearningItemQuery): Promise<LearningItem[]>;
  get(id: string): Promise<LearningItem>;
  create(input: LearningItemDraft): Promise<LearningItem>;
  update(input: LearningItemDraft & { id: string; version: number }): Promise<LearningItem>;
  setFavorite(id: string, version: number, favorite: boolean): Promise<LearningItem>;
  setDeleted(id: string, version: number, deleted: boolean): Promise<LearningItem>;
  touchOpened(id: string, version: number): Promise<LearningItem>;
  deletePermanently(id: string, version: number): Promise<void>;
}
