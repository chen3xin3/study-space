import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/settings.defaults";
import { TauriDataService } from "./tauri-data.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn(), writeFile: vi.fn() }));

describe("TauriDataService on Android", () => {
  const service = new TauriDataService("android");

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports an Android content URI by staging its bytes", async () => {
    vi.mocked(open).mockResolvedValue("content://documents/photo.jpg");
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(invoke).mockResolvedValue({
      id: "attachment-1",
      originalName: "photo.jpg",
      mediaType: "image/jpeg",
      byteSize: 3,
      sha256: "hash",
      createdAt: "2026-10-06T00:00:00Z",
    });

    await service.chooseAndImportAttachment();

    expect(readFile).toHaveBeenCalledWith("content://documents/photo.jpg");
    expect(invoke).toHaveBeenCalledWith("import_attachment_bytes", {
      originalName: "photo.jpg",
      bytes: [1, 2, 3],
    });
  });

  it("exports a generated backup to the chosen Android document", async () => {
    vi.mocked(save).mockResolvedValue("content://documents/study-space-backup.zip");
    vi.mocked(invoke)
      .mockResolvedValueOnce({ path: "internal.zip", createdAt: "now", byteSize: 3 })
      .mockResolvedValueOnce([1, 2, 3]);

    const result = await service.createBackup(defaultSettings);

    expect(invoke).toHaveBeenNthCalledWith(1, "create_backup", { settings: defaultSettings });
    expect(invoke).toHaveBeenNthCalledWith(2, "read_backup_bytes", { backupPath: "internal.zip" });
    expect(writeFile).toHaveBeenCalledWith(
      "content://documents/study-space-backup.zip",
      new Uint8Array([1, 2, 3]),
    );
    if (result === null) throw new Error("expected Android backup export result");
    expect(result.path).toBe("content://documents/study-space-backup.zip");
  });

  it("does not generate an Android backup when export is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);

    await expect(service.createBackup(defaultSettings)).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stages a selected Android backup before inspection", async () => {
    vi.mocked(open).mockResolvedValue("content://documents/backup.zip");
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([4, 5]));
    vi.mocked(invoke).mockResolvedValue("staged-backup.zip");

    await expect(service.chooseBackup()).resolves.toBe("staged-backup.zip");
    expect(invoke).toHaveBeenCalledWith("stage_backup_bytes", { bytes: [4, 5] });
  });
});
