import { BrowserDataService } from "./browser-data.service";
import type { DataService } from "./data.types";
import { TauriDataService } from "./tauri-data.service";

export function createDataService(): DataService {
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return tauriWindow.__TAURI_INTERNALS__
    ? new TauriDataService()
    : new BrowserDataService();
}

export type {
  AttachmentRecord,
  BackupPreview,
  BackupResult,
  DataService,
  DataStatus,
  RestoreResult,
} from "./data.types";
