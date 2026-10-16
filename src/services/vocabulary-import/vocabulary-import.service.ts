import { BrowserVocabularyImportService } from "./browser-vocabulary-import.service";
import { TauriVocabularyImportService } from "./tauri-vocabulary-import.service";
import type { VocabularyImportService } from "./vocabulary-import.types";

export function createVocabularyImportService(): VocabularyImportService {
  const value = window as Window & { __TAURI_INTERNALS__?: unknown };
  return value.__TAURI_INTERNALS__
    ? new TauriVocabularyImportService()
    : new BrowserVocabularyImportService();
}

export type * from "./vocabulary-import.types";
