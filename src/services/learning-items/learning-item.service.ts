import { BrowserLearningItemService } from "./browser-learning-item.service";
import { TauriLearningItemService } from "./tauri-learning-item.service";
import type { LearningItemService } from "./learning-item.types";

export function createLearningItemService(): LearningItemService {
  return (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ? new TauriLearningItemService()
    : new BrowserLearningItemService(window.localStorage);
}

export type * from "./learning-item.types";
