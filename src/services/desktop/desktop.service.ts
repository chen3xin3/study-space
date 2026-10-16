import { BrowserDesktopService } from "./browser-desktop.service";
import type { DesktopService } from "./desktop.types";
import { TauriDesktopService } from "./tauri-desktop.service";

export function createDesktopService(): DesktopService {
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return tauriWindow.__TAURI_INTERNALS__ ? new TauriDesktopService() : new BrowserDesktopService();
}
