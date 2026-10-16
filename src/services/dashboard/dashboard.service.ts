import { BrowserDashboardService } from "./browser-dashboard.service";
import { TauriDashboardService } from "./tauri-dashboard.service";
import type { DashboardService } from "./dashboard.types";
export function createDashboardService(): DashboardService {
  const current = window as Window & { __TAURI_INTERNALS__?: unknown };
  return current.__TAURI_INTERNALS__ ? new TauriDashboardService() : new BrowserDashboardService();
}
export type * from "./dashboard.types";
