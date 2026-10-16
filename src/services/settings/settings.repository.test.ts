import { defaultSettings } from "./settings.defaults";
import {
  SETTINGS_STORAGE_KEY,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from "./settings.repository";

describe("settings repository", () => {
  it("returns defaults when no settings were saved", () => {
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it("merges saved values with defaults", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ theme: "night", sidebarCollapsed: true }),
    );

    expect(loadSettings()).toEqual({
      ...defaultSettings,
      theme: "night",
      sidebarCollapsed: true,
    });
  });

  it("falls back to defaults when persisted JSON is invalid", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, "{");
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it("rejects invalid values field by field", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        theme: "unknown",
        fontScale: 42,
        density: "tiny",
        sidebarCollapsed: "yes",
        examDate: "2026-02-31",
        mathType: "math-9",
        aiEnabled: "false",
        showManualWordEntry: "legacy-value-is-ignored",
      }),
    );

    expect(loadSettings()).toEqual(defaultSettings);
  });

  it("sanitizes restored settings before applying them", () => {
    expect(sanitizeSettings({ theme: "night", aiEnabled: "yes" })).toEqual({
      ...defaultSettings,
      theme: "night",
    });
  });

  it("saves the complete settings object", () => {
    const settings = { ...defaultSettings, aiEnabled: true };
    saveSettings(settings);
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual(settings);
  });

  it("restores safe focus sound preferences from partial legacy settings", () => {
    expect(sanitizeSettings({ focusSound: "brown", focusSoundVolume: 0.42, focusSoundDuringBreak: true })).toEqual({
      ...defaultSettings, focusSound: "brown", focusSoundVolume: 0.42, focusSoundDuringBreak: true,
    });
    expect(sanitizeSettings({ focusSound: "rain", focusSoundVolume: 4, focusSoundDuringBreak: "yes" })).toEqual(defaultSettings);
  });
});
