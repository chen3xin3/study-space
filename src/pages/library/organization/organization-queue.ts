import type { MaterialOrganizationSuggestion, PhotoOrganizationSuggestion } from "../../../services/ai/ai.types";
import type { LearningItem, LearningSubject } from "../../../services/learning-items/learning-item.types";
import type { PhotoRecord } from "../../../services/photo-archive/photo-archive.types";

export type OrganizationSource = "learning" | "photo";
export type OrganizationStatus = "waiting" | "analyzing" | "reviewing" | "applied" | "skipped" | "failed";
export type OrganizationSuggestion = MaterialOrganizationSuggestion | PhotoOrganizationSuggestion;

export interface OrganizationCandidate {
  id: string;
  source: OrganizationSource;
  title: string;
  subject: LearningSubject | null;
  updatedAt: string;
  record: LearningItem | PhotoRecord;
}

export interface OrganizationQueueItem {
  candidate: OrganizationCandidate;
  status: OrganizationStatus;
  suggestion: OrganizationSuggestion | null;
  error: string;
}

export interface OrganizationQueueState {
  items: OrganizationQueueItem[];
  currentIndex: number;
}

const limit = 10;
const replaceCurrent = (state: OrganizationQueueState, update: (item: OrganizationQueueItem) => OrganizationQueueItem): OrganizationQueueState => ({
  ...state,
  items: state.items.map((item, index) => index === state.currentIndex ? update(item) : item),
});

export function selectCandidates(candidates: OrganizationCandidate[]): OrganizationCandidate[] {
  const unique = candidates.filter((candidate, index) => candidates.findIndex((item) => item.id === candidate.id) === index);
  if (unique.length > limit) throw new Error("一次最多整理 10 条资料");
  return unique;
}

export function toggleCandidate(selected: OrganizationCandidate[], candidate: OrganizationCandidate): OrganizationCandidate[] {
  return selected.some((item) => item.id === candidate.id)
    ? selected.filter((item) => item.id !== candidate.id)
    : selectCandidates([...selected, candidate]);
}

export function startQueue(candidates: OrganizationCandidate[]): OrganizationQueueState {
  const selected = selectCandidates(candidates);
  return {
    items: selected.map((candidate) => ({ candidate, status: "waiting", suggestion: null, error: "" })),
    currentIndex: 0,
  };
}

export function currentQueueItem(state: OrganizationQueueState): OrganizationQueueItem | null {
  return state.items[state.currentIndex] ?? null;
}

export const markAnalyzing = (state: OrganizationQueueState) => replaceCurrent(state, (item) => ({ ...item, status: "analyzing", error: "" }));
export const markReviewing = (state: OrganizationQueueState, suggestion: OrganizationSuggestion) => replaceCurrent(state, (item) => ({ ...item, status: "reviewing", suggestion, error: "" }));
export const markApplied = (state: OrganizationQueueState) => replaceCurrent(state, (item) => ({ ...item, status: "applied", error: "" }));
export const markSkipped = (state: OrganizationQueueState) => replaceCurrent(state, (item) => ({ ...item, status: "skipped", error: "" }));
export const markFailed = (state: OrganizationQueueState, error: string) => replaceCurrent(state, (item) => ({ ...item, status: "failed", error }));
export const retryCurrent = (state: OrganizationQueueState) => replaceCurrent(state, (item) => ({ ...item, status: "waiting", suggestion: null, error: "" }));

export function advanceQueue(state: OrganizationQueueState): OrganizationQueueState {
  const current = currentQueueItem(state);
  if (!current || !["applied", "skipped"].includes(current.status)) return state;
  const nextIndex = state.items.findIndex((item, index) => index > state.currentIndex && item.status === "waiting");
  return nextIndex < 0 ? state : { ...state, currentIndex: nextIndex };
}

export function queueSummary(state: OrganizationQueueState) {
  return state.items.reduce((summary, item) => {
    if (item.status === "applied") summary.applied++;
    else if (item.status === "skipped") summary.skipped++;
    else if (item.status === "failed") summary.failed++;
    else summary.pending++;
    return summary;
  }, { applied: 0, skipped: 0, failed: 0, pending: 0 });
}
