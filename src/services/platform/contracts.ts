export type {
  AttachmentRecord,
  BackupPreview,
  BackupResult,
  DataService,
  DataStatus,
  RestoreResult,
} from "../data/data.types";

export interface AIRequestInput {
  feature: "essay-review" | "math-explanation" | "subjective-review" | "exam-review" | "study-analysis";
  prompt: string;
  attachmentIds: string[];
}

export interface AIService {
  submit(input: AIRequestInput): Promise<{ requestId: string }>;
}

export type { SyncService } from "../sync/sync.types";
