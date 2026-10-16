import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { BrowserSyncService } from "./browser-sync.service";
import { TauriSyncService } from "./tauri-sync.service";
import { toSyncServiceError } from "./sync.types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const manifest = {
  protocolVersion: 1,
  appVersion: "0.6.0",
  deviceName: "Study PC",
  platform: "windows",
  createdAt: "2026-10-10T12:00:00Z",
  byteSize: 1024,
  attachmentCount: 2,
  sha256: "ab".repeat(32),
};

describe("TauriSyncService", () => {
  const service = new TauriSyncService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({});
  });

  it("uses exact command envelopes for send and receive", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ address: "192.168.1.2:43000", pairingCode: "381204", expiresAt: "later", status: "waiting", manifest })
      .mockResolvedValueOnce({ address: "192.168.1.2:43000", sessionToken: "token", manifest })
      .mockResolvedValueOnce({ stagedPath: "managed.zip", expectedFingerprint: manifest.sha256, manifest });
    await service.startSending({ settings: { theme: "light" }, deviceName: "Study PC" });
    const preview = await service.inspectSource({ address: "192.168.1.2:43000", pairingCode: "381204" });
    await service.receiveBackup(preview);
    expect(invoke).toHaveBeenNthCalledWith(1, "start_lan_sync_send", { settings: { theme: "light" }, deviceName: "Study PC" });
    expect(invoke).toHaveBeenNthCalledWith(2, "inspect_lan_sync_source", { address: "192.168.1.2:43000", pairingCode: "381204" });
    expect(invoke).toHaveBeenNthCalledWith(3, "receive_lan_sync_backup", { preview });
  });

  it("restores only the received path and fingerprint", async () => {
    vi.mocked(invoke).mockResolvedValue({ restoredAt: "now", settings: { theme: "light" } });
    await service.restoreReceived({ stagedPath: "managed.zip", expectedFingerprint: "sha256-value", currentSettings: { theme: "light" } });
    expect(invoke).toHaveBeenCalledWith("restore_lan_sync_backup", {
      stagedPath: "managed.zip",
      expectedFingerprint: "sha256-value",
      currentSettings: { theme: "light" },
    });
  });

  it("turns structured command failures into readable errors", async () => {
    expect(toSyncServiceError({ code: "SYNC_PAIRING_FAILED", message: "private transport detail" }).message)
      .toBe("连接码错误、已过期或已经使用。");
    vi.mocked(invoke).mockRejectedValue({ code: "SYNC_PAIRING_FAILED", message: "private transport detail" });
    await expect(service.inspectSource({ address: "192.168.1.2:43000", pairingCode: "000000" }))
      .rejects.toMatchObject({ code: "SYNC_PAIRING_FAILED", message: "连接码错误、已过期或已经使用。" });
  });
});

it("browser preview never pretends device sync succeeded", async () => {
  await expect(new BrowserSyncService().startSending({ settings: {}, deviceName: "Browser" }))
    .rejects.toMatchObject({ code: "SYNC_UNAVAILABLE", message: "电脑与平板互联需要在安装版中使用。" });
});

