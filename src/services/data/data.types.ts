import type { AppSettings } from "../settings/settings.types";

export type DataState = "ready" | "error";

export interface DataStatus {
  state: DataState;
  databasePath: string;
  schemaVersion: number;
  attachmentCount: number;
  lastBackupAt: string | null;
}

export interface AttachmentRecord {
  id: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

export interface BackupResult {
  path: string;
  createdAt: string;
  byteSize: number;
}

export interface BackupPreview {
  path: string;
  createdAt: string;
  appVersion: string;
  fingerprint: string;
}

export interface RestoreResult {
  restoredAt: string;
  settings: unknown;
}

export interface DataService {
  getStatus(): Promise<DataStatus>;
  chooseAndImportAttachment(): Promise<AttachmentRecord | null>;
  createBackup(settings: AppSettings): Promise<BackupResult | null>;
  chooseBackup(): Promise<string | null>;
  inspectBackup(backupPath: string): Promise<BackupPreview>;
  restoreBackup(backupPath: string, expectedFingerprint: string, currentSettings: AppSettings): Promise<RestoreResult>;
}
