import { VocabularyImportServiceError } from "./vocabulary-import.errors";
import type {
  BatchImportInput, UpdateImportCandidateInput, VocabularyImportService,
} from "./vocabulary-import.types";

export class BrowserVocabularyImportService implements VocabularyImportService {
  createSession(_ids: string[]): Promise<never> { return this.reject(); }
  getSession(_id: string): Promise<never> { return this.reject(); }
  listOpenSessions() { return Promise.resolve([]); }
  rotateImage(_sessionId: string, _attachmentId: string, _version: number, _degrees: number): Promise<never> { return this.reject(); }
  recognize(_id: string, _version: number): Promise<never> {
    return Promise.reject(new VocabularyImportServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中识别手写单词。"));
  }
  retry(_id: string, _version: number): Promise<never> { return this.recognize(_id, _version); }
  updateCandidate(_input: UpdateImportCandidateInput): Promise<never> { return this.reject(); }
  previewDuplicates(_id: string): Promise<never> { return this.reject(); }
  commit(_input: BatchImportInput): Promise<never> { return this.reject(); }
  deleteSession(_id: string, _version: number): Promise<never> { return this.reject(); }
  importClipboardImage(_bytes: number[], _mediaType: string): Promise<never> { return this.reject(); }
  private reject(): Promise<never> {
    return Promise.reject(new VocabularyImportServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中使用照片录入。"));
  }
}
