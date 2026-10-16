import { BrowserFocusService } from "./browser-focus.service";
import { TauriFocusService } from "./tauri-focus.service";
import type { FocusService } from "./focus.types";
export function createFocusService(): FocusService {
  return (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ? new TauriFocusService() : new BrowserFocusService();
}
export type * from "./focus.types";
