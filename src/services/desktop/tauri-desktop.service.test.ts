import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { TauriDesktopService } from "./tauri-desktop.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.mocked(invoke).mockReset());

it("reads desktop preferences through the native command", async () => {
  const preferences = { closeToTray: false, launchAtStartup: false };
  vi.mocked(invoke).mockResolvedValue(preferences);
  await expect(new TauriDesktopService().getPreferences()).resolves.toEqual(preferences);
  expect(invoke).toHaveBeenCalledWith("get_desktop_preferences");
});

it("sends the complete preference set when updating", async () => {
  const preferences = { closeToTray: true, launchAtStartup: false };
  vi.mocked(invoke).mockResolvedValue(preferences);
  await new TauriDesktopService().updatePreferences(preferences);
  expect(invoke).toHaveBeenCalledWith("update_desktop_preferences", { preferences });
});
