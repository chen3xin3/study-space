import type { DiagnosticsService, DiagnosticStatus } from "./diagnostics.types";

export class BrowserDiagnosticsService implements DiagnosticsService {
  async getStatus(): Promise<DiagnosticStatus> {
    return { healthy: false, appVersion: "浏览器预览", logDirectory: "", schemaVersion: 0, attachmentCount: 0, recentEvents: [] };
  }
  async openLogFolder(): Promise<void> { throw new Error("此功能需要 Windows 桌面版。"); }
  async exportReport(): Promise<string | null> { throw new Error("此功能需要 Windows 桌面版。"); }
}

