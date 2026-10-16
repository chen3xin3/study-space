import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { defaultSettings } from "../../services/settings/settings.defaults";
import type { SyncService } from "../../services/sync/sync.types";
import { DeviceSyncCard } from "./DeviceSyncCard";

const manifest = {
  protocolVersion: 1,
  appVersion: "0.6.0",
  deviceName: "书房电脑",
  platform: "windows",
  createdAt: "2026-10-10T12:00:00Z",
  byteSize: 2048,
  attachmentCount: 3,
  sha256: "ab".repeat(32),
};
const pairingCode = "ABCDE-FGHJK-MNPQR-STUVW";

function service(): SyncService {
  return {
    startSending: vi.fn().mockResolvedValue({ address: "192.168.1.2:43000", pairingCode, expiresAt: "2026-10-10T12:10:00Z", status: "waiting", manifest }),
    getSendStatus: vi.fn().mockResolvedValue(null),
    stopSending: vi.fn().mockResolvedValue(undefined),
    inspectSource: vi.fn().mockResolvedValue({ address: "192.168.1.2:43000", sessionToken: "token", manifest }),
    receiveBackup: vi.fn().mockResolvedValue({ stagedPath: "managed.zip", expectedFingerprint: manifest.sha256, manifest }),
    restoreReceived: vi.fn().mockResolvedValue({ restoredAt: "now", settings: defaultSettings }),
  };
}

it("starts an explicit sender session and shows connection details", async () => {
  const api = service();
  render(<DeviceSyncCard service={api} settings={defaultSettings} platform="windows" onSettingsRestored={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "发送当前数据" }));
  expect(await screen.findByText(pairingCode)).toBeVisible();
  expect(screen.getByText("192.168.1.2:43000")).toBeVisible();
  expect(screen.getByText(/3 个附件/)).toBeVisible();
  expect(api.startSending).toHaveBeenCalledWith({ settings: defaultSettings, deviceName: "Windows 电脑" });
});

it("previews replacement and never downloads before explicit confirmation", async () => {
  const api = service();
  render(<DeviceSyncCard service={api} settings={defaultSettings} platform="android" onSettingsRestored={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "接收另一台设备的数据" }));
  await userEvent.type(screen.getByLabelText("局域网地址"), "192.168.1.2:43000");
  await userEvent.type(screen.getByLabelText("连接码"), pairingCode);
  await userEvent.click(screen.getByRole("button", { name: "查看可接收数据" }));
  expect(await screen.findByText(/将替换这台设备上的当前数据/)).toBeVisible();
  expect(screen.getByText("书房电脑")).toBeVisible();
  expect(api.receiveBackup).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "确认接收并替换" })).toBeDisabled();
});

it("receives, verifies and restores only after confirmation", async () => {
  const api = service();
  const restored = vi.fn();
  render(<DeviceSyncCard service={api} settings={defaultSettings} platform="android" onSettingsRestored={restored} />);
  await userEvent.click(screen.getByRole("button", { name: "接收另一台设备的数据" }));
  await userEvent.type(screen.getByLabelText("局域网地址"), "192.168.1.2:43000");
  await userEvent.type(screen.getByLabelText("连接码"), pairingCode);
  await userEvent.click(screen.getByRole("button", { name: "查看可接收数据" }));
  await userEvent.click(await screen.findByRole("checkbox", { name: /我知道接收会替换/ }));
  await userEvent.click(screen.getByRole("button", { name: "确认接收并替换" }));
  await waitFor(() => expect(api.restoreReceived).toHaveBeenCalled());
  expect(api.receiveBackup).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: "token" }));
  expect(restored).toHaveBeenCalledWith(defaultSettings);
  expect(await screen.findByText("数据已接收并恢复完成")).toBeVisible();
});

