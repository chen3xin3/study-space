import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { defaultSettings } from "../../services/settings/settings.defaults";
import type { DataService } from "../../services/data/data.types";
import { DataManagementCard } from "./DataManagementCard";

function createService(overrides: Partial<DataService> = {}): DataService {
  return {
    getStatus: vi.fn().mockResolvedValue({
      state: "ready",
      databasePath: "D:\\study-space\\study-space.db",
      schemaVersion: 1,
      attachmentCount: 3,
      lastBackupAt: null,
    }),
    chooseAndImportAttachment: vi.fn().mockResolvedValue(null),
    createBackup: vi.fn().mockResolvedValue({
      path: "D:\\study-space\\backups\\backup.zip",
      createdAt: "2026-09-25T00:00:00Z",
      byteSize: 1024,
    }),
    chooseBackup: vi.fn().mockResolvedValue("D:\\study-space\\backups\\backup.zip"),
    inspectBackup: vi.fn().mockResolvedValue({
      path: "D:\\study-space\\backups\\backup.zip",
      createdAt: "2026-09-25T00:00:00Z",
      appVersion: "0.2.0",
      fingerprint: "confirmed-sha256",
    }),
    restoreBackup: vi.fn().mockResolvedValue({
      restoredAt: "2026-09-25T00:00:00Z",
      settings: {},
    }),
    ...overrides,
  };
}

describe("DataManagementCard", () => {
  it("shows the local data health summary", async () => {
    render(
      <DataManagementCard
        service={createService()}
        settings={defaultSettings}
        onSettingsRestored={vi.fn()}
      />,
    );

    expect(await screen.findByText("本地数据正常")).toBeInTheDocument();
    expect(screen.getByText("3 个附件")).toBeInTheDocument();
    expect(screen.getByText(/study-space\.db/)).toBeInTheDocument();
  });

  it("locks actions while creating a backup and reports success", async () => {
    let resolveBackup!: (value: { path: string; createdAt: string; byteSize: number }) => void;
    const pendingBackup = new Promise<{ path: string; createdAt: string; byteSize: number }>(
      (resolve) => { resolveBackup = resolve; },
    );
    const service = createService({ createBackup: vi.fn(() => pendingBackup) });
    const user = userEvent.setup();
    render(
      <DataManagementCard
        service={service}
        settings={defaultSettings}
        onSettingsRestored={vi.fn()}
      />,
    );

    const backupButton = await screen.findByRole("button", { name: "创建完整备份" });
    await user.click(backupButton);
    expect(screen.getByRole("button", { name: "正在创建备份…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入测试文件" })).toBeDisabled();

    resolveBackup({
      path: "D:\\study-space\\backups\\backup.zip",
      createdAt: "2026-09-25T00:00:00Z",
      byteSize: 1024,
    });
    expect(await screen.findByText(/完整备份已创建/)).toBeInTheDocument();
  });

  it("does not restore until the user confirms", async () => {
    const service = createService();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(
      <DataManagementCard
        service={service}
        settings={defaultSettings}
        onSettingsRestored={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "从备份恢复" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining("backup.zip")));
    expect(service.chooseBackup).toHaveBeenCalled();
    expect(service.inspectBackup).toHaveBeenCalled();
    expect(service.restoreBackup).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("sanitizes restored settings before applying them", async () => {
    const onSettingsRestored = vi.fn();
    const service = createService({
      restoreBackup: vi.fn().mockResolvedValue({
        restoredAt: "2026-09-25T00:00:00Z",
        settings: { theme: "night", aiEnabled: "unsafe" },
      }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <DataManagementCard
        service={service}
        settings={defaultSettings}
        onSettingsRestored={onSettingsRestored}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "从备份恢复" }));
    await waitFor(() => expect(onSettingsRestored).toHaveBeenCalledWith({
      ...defaultSettings,
      theme: "night",
    }));
    vi.restoreAllMocks();
  });
});
