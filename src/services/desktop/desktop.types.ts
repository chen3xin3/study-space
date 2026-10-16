export interface DesktopPreferences {
  closeToTray: boolean;
  launchAtStartup: boolean;
}

export interface DesktopService {
  getPreferences(): Promise<DesktopPreferences>;
  updatePreferences(preferences: DesktopPreferences): Promise<DesktopPreferences>;
}
