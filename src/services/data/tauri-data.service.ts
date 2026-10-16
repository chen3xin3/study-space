import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  currentPlatformEnvironment,
  detectRuntimePlatform,
  type RuntimePlatform,
} from "../../platform/platform";
import { toDataServiceError } from "./data.errors";
import type {
  AttachmentRecord,
  BackupPreview,
  BackupResult,
  DataService,
  DataStatus,
  RestoreResult,
} from "./data.types";
import type { AppSettings } from "../settings/settings.types";

export class TauriDataService implements DataService {
  constructor(
    private readonly platform: RuntimePlatform = detectRuntimePlatform(currentPlatformEnvironment()),
  ) {}

  async getStatus(): Promise<DataStatus> {
    return this.run(() => invoke<DataStatus>("get_data_status"));
  }

  async chooseAndImportAttachment(): Promise<AttachmentRecord | null> {
    const sourcePath = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "可导入文件",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "pdf", "doc", "docx"],
        },
      ],
    });
    if (sourcePath === null) return null;

    if (this.platform === "android") {
      const bytes = await readFile(sourcePath);
      return this.run(() => invoke<AttachmentRecord>("import_attachment_bytes", {
        originalName: fileNameFromSource(sourcePath),
        bytes: Array.from(bytes),
      }));
    }

    return this.run(() => invoke<AttachmentRecord>("import_attachment", { sourcePath }));
  }

  async createBackup(settings: AppSettings): Promise<BackupResult | null> {
    if (this.platform !== "android") {
      return this.run(() => invoke<BackupResult>("create_backup", { settings }));
    }

    const destination = await save({
      defaultPath: "study-space-backup.zip",
      filters: [{ name: "完整备份", extensions: ["application/zip", "zip"] }],
    });
    if (destination === null) return null;

    return this.run(async () => {
      const backup = await invoke<BackupResult>("create_backup", { settings });
      const bytes = await invoke<number[]>("read_backup_bytes", { backupPath: backup.path });
      await writeFile(destination, new Uint8Array(bytes));
      return { ...backup, path: destination };
    });
  }

  async chooseBackup(): Promise<string | null> {
    const backupPath = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "完整备份", extensions: ["zip"] }],
    });
    if (backupPath === null || this.platform !== "android") return backupPath;

    const bytes = await readFile(backupPath);
    return this.run(() => invoke<string>("stage_backup_bytes", { bytes: Array.from(bytes) }));
  }

  async inspectBackup(backupPath: string): Promise<BackupPreview> {
    return this.run(() =>
      invoke<BackupPreview>("inspect_backup", { backupPath }),
    );
  }

  async restoreBackup(backupPath: string, expectedFingerprint: string, currentSettings: AppSettings): Promise<RestoreResult> {
    return this.run(() =>
      invoke<RestoreResult>("restore_backup", { backupPath, expectedFingerprint, currentSettings }),
    );
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toDataServiceError(error);
    }
  }
}

function fileNameFromSource(source: string): string {
  const withoutQuery = source.split(/[?#]/, 1)[0];
  const encodedName = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1) ?? "imported-file";
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}
