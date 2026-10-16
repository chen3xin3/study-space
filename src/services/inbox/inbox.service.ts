import { BrowserInboxService } from "./browser-inbox.service";
import { TauriInboxService } from "./tauri-inbox.service";
import type { InboxService } from "./inbox.types";
export function createInboxService(): InboxService {
  return (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ? new TauriInboxService() : new BrowserInboxService();
}
export type * from "./inbox.types";
