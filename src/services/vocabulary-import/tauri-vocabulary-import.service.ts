import { invoke } from "@tauri-apps/api/core";
import { toVocabularyImportServiceError } from "./vocabulary-import.errors";
import type {
  BatchImportInput, BatchImportResult, DuplicatePreview, ImportCandidate,
  ImportSessionDetail, UpdateImportCandidateInput, VocabularyImportService,
} from "./vocabulary-import.types";
import type { AttachmentRecord } from "../data/data.types";

export class TauriVocabularyImportService implements VocabularyImportService {
  createSession(attachmentIds: string[]) { return this.run(() => invoke<ImportSessionDetail>("create_vocabulary_import", { attachmentIds })); }
  getSession(sessionId: string) { return this.run(() => invoke<ImportSessionDetail>("get_vocabulary_import", { sessionId })); }
  listOpenSessions() { return this.run(() => invoke<ImportSessionDetail[]>("list_open_vocabulary_imports")); }
  rotateImage(sessionId: string, attachmentId: string, version: number, rotationDegrees: number) {
    return this.run(() => invoke<ImportSessionDetail>("rotate_vocabulary_import_image", { sessionId, attachmentId, version, rotationDegrees }));
  }
  recognize(sessionId: string, version: number) { return this.run(() => invoke<ImportSessionDetail>("recognize_vocabulary_import", { sessionId, version })); }
  retry(sessionId: string, version: number) { return this.run(() => invoke<ImportSessionDetail>("retry_vocabulary_import", { sessionId, version })); }
  updateCandidate(input: UpdateImportCandidateInput) { return this.run(() => invoke<ImportCandidate>("update_vocabulary_import_candidate", { input })); }
  previewDuplicates(sessionId: string) { return this.run(() => invoke<DuplicatePreview[]>("preview_vocabulary_import_duplicates", { sessionId })); }
  commit(input: BatchImportInput) { return this.run(() => invoke<BatchImportResult>("commit_vocabulary_import", { input })); }
  deleteSession(sessionId: string, version: number) { return this.run(() => invoke<void>("delete_vocabulary_import", { sessionId, version })); }
  importClipboardImage(bytes: number[], mediaType: string) { return this.run(() => invoke<AttachmentRecord>("import_clipboard_image", { bytes, mediaType })); }
  private async run<T>(operation: () => Promise<T>) {
    try { return await operation(); } catch (error) { throw toVocabularyImportServiceError(error); }
  }
}
