import { BrowserFocusPlanService } from "./browser-focus-plan.service";
import { TauriFocusPlanService } from "./tauri-focus-plan.service";
import type { FocusPlanService } from "./focus.types";

export function createFocusPlanService(): FocusPlanService {
  return (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ? new TauriFocusPlanService() : new BrowserFocusPlanService();
}
