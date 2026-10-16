import { DataServiceError } from "./data.errors";
import type {
  AttachmentRecord,
  BackupPreview,
  BackupResult,
  DataService,
  DataStatus,
  RestoreResult,
} from "./data.types";
import type { AppSettings } from "../settings/settings.types";

export class BrowserDataService implements DataService {
  async getStatus(): Promise<DataStatus> {
    return {
      state: "error",
      databasePath: "请在 Windows 桌面应用中使用",
      schemaVersion: 0,
      attachmentCount: 0,
      lastBackupAt: null,
    };
  }

  async chooseAndImportAttachment(): Promise<AttachmentRecord | null> {
    throw this.desktopOnly();
  }

  async createBackup(_settings: AppSettings): Promise<BackupResult> {
    throw this.desktopOnly();
  }

  async chooseBackup(): Promise<string | null> {
    throw this.desktopOnly();
  }

  async inspectBackup(_backupPath: string): Promise<BackupPreview> {
    throw this.desktopOnly();
  }

  async restoreBackup(_backupPath: string, _expectedFingerprint: string, _currentSettings: AppSettings): Promise<RestoreResult> {
    throw this.desktopOnly();
  }

  private desktopOnly(): DataServiceError {
    return new DataServiceError(
      "DESKTOP_ONLY",
      "此功能需要在 Windows 桌面应用中使用。",
    );
  }
}
