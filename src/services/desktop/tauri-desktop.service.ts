import { invoke } from "@tauri-apps/api/core";
import type { DesktopPreferences, DesktopService } from "./desktop.types";

export class TauriDesktopService implements DesktopService {
  getPreferences(): Promise<DesktopPreferences> {
    return invoke<DesktopPreferences>("get_desktop_preferences");
  }

  updatePreferences(preferences: DesktopPreferences): Promise<DesktopPreferences> {
    return invoke<DesktopPreferences>("update_desktop_preferences", { preferences });
  }
}
