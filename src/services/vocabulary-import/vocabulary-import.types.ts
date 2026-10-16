import type { AttachmentRecord } from "../data/data.types";

export type ImportStatus = "draft" | "recognizing" | "reviewing" | "completed" | "failed";
export type ImportConfidence = "confident" | "uncertain";
export type ImportResolution = "create" | "encounter_only" | "append_meaning" | "restore_and_append" | "skip";

export interface ImportImage {
  attachmentId: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sortOrder: number;
  rotationDegrees: number;
}

export interface ImportCandidate {
  id: string;
  word: string;
  meaningOrNote: string | null;
  confidence: ImportConfidence;
  sourceAttachmentId: string | null;
  sourceLine: number | null;
  selected: boolean;
  resolution: ImportResolution | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ImportSessionDetail {
  id: string;
  status: ImportStatus;
  errorCode: string | null;
  images: ImportImage[];
  candidates: ImportCandidate[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface UpdateImportCandidateInput {
  id: string;
  version: number;
  word: string;
  meaningOrNote: string | null;
  confidence: ImportConfidence;
  selected: boolean;
  resolution: ImportResolution | null;
}

export interface DuplicatePreview {
  candidateId: string;
  word: string;
  existingWordId: string | null;
  existingDeleted: boolean;
  existingMeanings: string[];
  sameBatchCandidateIds: string[];
}

export interface BatchImportItem {
  candidateId: string;
  candidateVersion: number;
  resolution: ImportResolution;
  tags: string[];
}

export interface BatchImportInput {
  sessionId: string;
  version: number;
  items: BatchImportItem[];
}

export interface BatchImportResult {
  created: number;
  appended: number;
  restored: number;
  skipped: number;
  failed: number;
}

export interface VocabularyImportService {
  createSession(attachmentIds: string[]): Promise<ImportSessionDetail>;
  getSession(sessionId: string): Promise<ImportSessionDetail>;
  listOpenSessions(): Promise<ImportSessionDetail[]>;
  rotateImage(sessionId: string, attachmentId: string, version: number, rotationDegrees: number): Promise<ImportSessionDetail>;
  recognize(sessionId: string, version: number): Promise<ImportSessionDetail>;
  retry(sessionId: string, version: number): Promise<ImportSessionDetail>;
  updateCandidate(input: UpdateImportCandidateInput): Promise<ImportCandidate>;
  previewDuplicates(sessionId: string): Promise<DuplicatePreview[]>;
  commit(input: BatchImportInput): Promise<BatchImportResult>;
  deleteSession(sessionId: string, version: number): Promise<void>;
  importClipboardImage(bytes: number[], mediaType: string): Promise<AttachmentRecord>;
}
