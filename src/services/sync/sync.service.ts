import { BrowserSyncService } from "./browser-sync.service";
import { TauriSyncService } from "./tauri-sync.service";
import type { SyncService } from "./sync.types";

export function createSyncService(): SyncService {
  return (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ? new TauriSyncService()
    : new BrowserSyncService();
}

export type * from "./sync.types";

