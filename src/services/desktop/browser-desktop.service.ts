import type { DesktopPreferences, DesktopService } from "./desktop.types";

const defaults: DesktopPreferences = { closeToTray: false, launchAtStartup: false };

export class BrowserDesktopService implements DesktopService {
  async getPreferences(): Promise<DesktopPreferences> { return defaults; }
  async updatePreferences(): Promise<DesktopPreferences> {
    throw new Error("此功能需要 Windows 桌面版。");
  }
}
