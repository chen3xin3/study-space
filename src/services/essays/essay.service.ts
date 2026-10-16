import { BrowserEssayService } from "./browser-essay.service";
import { TauriEssayService } from "./tauri-essay.service";
import type { EssayService } from "./essay.types";

export function createEssayService(): EssayService {
  const value = window as Window & { __TAURI_INTERNALS__?: unknown };
  return value.__TAURI_INTERNALS__ ? new TauriEssayService() : new BrowserEssayService();
}

export type * from "./essay.types";
