import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TauriDataService } from "./tauri-data.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

describe("TauriDataService", () => {
  const service = new TauriDataService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when attachment selection is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(service.chooseAndImportAttachment()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("selects, inspects, and passes the chosen backup to restore", async () => {
    vi.mocked(open).mockResolvedValue("D:\\backup.zip");
    vi.mocked(invoke).mockResolvedValue({
      restoredAt: "2026-09-25T00:00:00Z",
      settings: {},
    });

    const currentSettings = {
      theme: "eye-care" as const,
      fontScale: "medium" as const,
      density: "comfortable" as const,
      sidebarCollapsed: false,
      examDate: "",
      mathType: "math-1" as const,
      aiEnabled: false,
      focusSound: "off" as const,
      focusSoundVolume: 0.35,
      focusSoundDuringBreak: false,
    };
    await expect(service.chooseBackup()).resolves.toBe("D:\\backup.zip");
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "D:\\backup.zip",
      createdAt: "2026-09-25T00:00:00Z",
      appVersion: "0.2.0",
      fingerprint: "confirmed-sha256",
    });
    await service.inspectBackup("D:\\backup.zip");
    expect(invoke).toHaveBeenCalledWith("inspect_backup", {
      backupPath: "D:\\backup.zip",
    });
    await service.restoreBackup("D:\\backup.zip", "confirmed-sha256", currentSettings);

    expect(invoke).toHaveBeenCalledWith("restore_backup", {
      backupPath: "D:\\backup.zip",
      expectedFingerprint: "confirmed-sha256",
      currentSettings,
    });
  });

  it("maps desktop error codes without exposing raw internal errors", async () => {
    vi.mocked(invoke).mockRejectedValue({
      code: "BACKUP_INVALID",
      message: "raw message",
      internal: "private path",
    });

    await expect(service.getStatus()).rejects.toMatchObject({
      code: "BACKUP_INVALID",
      message: "所选备份文件无效或已损坏。",
    });
  });
});
