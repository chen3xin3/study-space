import { BrowserDiagnosticsService } from "./browser-diagnostics.service";
import type { DiagnosticsService } from "./diagnostics.types";
import { TauriDiagnosticsService } from "./tauri-diagnostics.service";

export function createDiagnosticsService(): DiagnosticsService {
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return tauriWindow.__TAURI_INTERNALS__ ? new TauriDiagnosticsService() : new BrowserDiagnosticsService();
}
