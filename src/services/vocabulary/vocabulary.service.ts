import { BrowserVocabularyService } from "./browser-vocabulary.service";
import { TauriVocabularyService } from "./tauri-vocabulary.service";
import type { VocabularyService } from "./vocabulary.types";

export function createVocabularyService(): VocabularyService {
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return tauriWindow.__TAURI_INTERNALS__
    ? new TauriVocabularyService()
    : new BrowserVocabularyService();
}

export type * from "./vocabulary.types";
