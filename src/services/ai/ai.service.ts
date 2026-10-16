import { BrowserAiService } from "./browser-ai.service";
import { TauriAiService } from "./tauri-ai.service";
import type { AiService } from "./ai.types";

export function createAiService(): AiService {
  const value = window as Window & { __TAURI_INTERNALS__?: unknown };
  return value.__TAURI_INTERNALS__ ? new TauriAiService() : new BrowserAiService();
}

export type * from "./ai.types";
