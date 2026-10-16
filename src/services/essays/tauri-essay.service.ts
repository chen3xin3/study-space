import { invoke } from "@tauri-apps/api/core";
import { toEssayServiceError } from "./essay.errors";
import type {
  AttemptDetail, AttemptListPage, CreateAttemptInput, CreateEssayInput,
  DictationComparison, EssayDetail, EssayImportDraft, EssayListPage, EssayListQuery, EssayService,
  EssaySummary, UpdateAttemptInput, UpdateEssayImportDraftInput, UpdateEssayInput,
} from "./essay.types";

export class TauriEssayService implements EssayService {
  createEssay(input: CreateEssayInput) { return this.run(() => invoke<EssayDetail>("create_essay", { input })); }
  getEssay(essayId: string) { return this.run(() => invoke<EssayDetail>("get_essay", { essayId })); }
  listEssays(query: EssayListQuery) { return this.run(() => invoke<EssayListPage>("list_essays", { query })); }
  updateEssay(input: UpdateEssayInput) { return this.run(() => invoke<EssayDetail>("update_essay", { input })); }
  deleteEssays(essayIds: string[]) { return this.run(() => invoke<number>("delete_essays", { essayIds })); }
  createAttempt(input: CreateAttemptInput) { return this.run(() => invoke<AttemptDetail>("create_essay_attempt", { input })); }
  getAttempt(attemptId: string) { return this.run(() => invoke<AttemptDetail>("get_essay_attempt", { attemptId })); }
  updateAttempt(input: UpdateAttemptInput) { return this.run(() => invoke<AttemptDetail>("update_essay_attempt", { input })); }
  completeAttempt(attemptId: string, version: number) {
    return this.run(() => invoke<AttemptDetail>("complete_essay_attempt", { attemptId, version }));
  }
  copyAttempt(sourceId: string, title: string) {
    return this.run(() => invoke<AttemptDetail>("copy_essay_attempt", { sourceId, title }));
  }
  listAttempts(cursor: string | null, limit: number) {
    return this.run(() => invoke<AttemptListPage>("list_essay_attempts", { cursor, limit }));
  }
  compareDictation(expected: string, actual: string) {
    return this.run(() => invoke<DictationComparison>("compare_essay_dictation", { expected, actual }));
  }
  getSummary() { return this.run(() => invoke<EssaySummary>("get_essay_summary")); }
  createImportDraft() { return this.run(() => invoke<EssayImportDraft>("create_essay_import_draft")); }
  getImportDraft(draftId: string) { return this.run(() => invoke<EssayImportDraft>("get_essay_import_draft", { draftId })); }
  listImportDrafts() { return this.run(() => invoke<EssayImportDraft[]>("list_essay_import_drafts")); }
  addImportDraftImage(draftId: string, version: number, bytes: number[], mediaType: string) {
    return this.run(() => invoke<EssayImportDraft>("add_essay_import_draft_image", { draftId, version, bytes, mediaType }));
  }
  removeImportDraftImage(draftId: string, version: number, attachmentId: string) {
    return this.run(() => invoke<EssayImportDraft>("remove_essay_import_draft_image", { draftId, version, attachmentId }));
  }
  updateImportDraft(input: UpdateEssayImportDraftInput) {
    return this.run(() => invoke<EssayImportDraft>("update_essay_import_draft", { input }));
  }
  abandonImportDraft(draftId: string, version: number) {
    return this.run(() => invoke<void>("abandon_essay_import_draft", { draftId, version }));
  }
  completeImportDraft(input: UpdateEssayImportDraftInput) {
    return this.run(() => invoke<EssayDetail>("complete_essay_import_draft", { input }));
  }

  private async run<T>(operation: () => Promise<T>) {
    try { return await operation(); } catch (error) { throw toEssayServiceError(error); }
  }
}
