import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { TauriDiagnosticsService } from "./tauri-diagnostics.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("loads status and opens the local log folder", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ healthy: true });
  const service = new TauriDiagnosticsService();
  await service.getStatus();
  await service.openLogFolder();
  expect(invoke).toHaveBeenNthCalledWith(1, "get_diagnostic_status");
  expect(invoke).toHaveBeenNthCalledWith(2, "open_diagnostic_folder");
});

it("asks for a destination before exporting a report", async () => {
  vi.mocked(save).mockResolvedValue("D:\\report.txt");
  const service = new TauriDiagnosticsService();
  expect(await service.exportReport()).toBe("D:\\report.txt");
  expect(invoke).toHaveBeenCalledWith("export_diagnostic_report", { destination: "D:\\report.txt" });
});

