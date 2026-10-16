import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { DiagnosticsService, DiagnosticStatus } from "./diagnostics.types";

export class TauriDiagnosticsService implements DiagnosticsService {
  getStatus(): Promise<DiagnosticStatus> { return invoke<DiagnosticStatus>("get_diagnostic_status"); }
  openLogFolder(): Promise<void> { return invoke("open_diagnostic_folder"); }

  async exportReport(): Promise<string | null> {
    const destination = await save({
      defaultPath: `学习空间-诊断报告-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: "文本报告", extensions: ["txt"] }],
    });
    if (!destination) return null;
    await invoke("export_diagnostic_report", { destination });
    return destination;
  }
}

