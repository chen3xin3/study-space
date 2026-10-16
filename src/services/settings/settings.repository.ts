import { defaultSettings } from "./settings.defaults";
import type { AppSettings } from "./settings.types";
import { isValidExamDate } from "../../utils/date";

export const SETTINGS_STORAGE_KEY = "study-space.settings.v1";
const themes = new Set(["eye-care", "macaron", "classic-green", "minimal-white", "night", "soft-gradient"]);
const fontScales = new Set(["small", "medium", "large"]);
const densities = new Set(["compact", "comfortable"]);
const mathTypes = new Set(["math-1", "math-2", "math-3"]);
const focusSounds = new Set(["off", "white", "pink", "brown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return { ...defaultSettings };

  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

export function sanitizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...defaultSettings };
  return {
    theme: typeof value.theme === "string" && themes.has(value.theme) ? value.theme as AppSettings["theme"] : defaultSettings.theme,
    fontScale: typeof value.fontScale === "string" && fontScales.has(value.fontScale) ? value.fontScale as AppSettings["fontScale"] : defaultSettings.fontScale,
    density: typeof value.density === "string" && densities.has(value.density) ? value.density as AppSettings["density"] : defaultSettings.density,
    sidebarCollapsed: typeof value.sidebarCollapsed === "boolean" ? value.sidebarCollapsed : defaultSettings.sidebarCollapsed,
    examDate: typeof value.examDate === "string" && (!value.examDate || isValidExamDate(value.examDate)) ? value.examDate : defaultSettings.examDate,
    mathType: typeof value.mathType === "string" && mathTypes.has(value.mathType) ? value.mathType as AppSettings["mathType"] : defaultSettings.mathType,
    aiEnabled: typeof value.aiEnabled === "boolean" ? value.aiEnabled : defaultSettings.aiEnabled,
    focusSound: typeof value.focusSound === "string" && focusSounds.has(value.focusSound) ? value.focusSound as AppSettings["focusSound"] : defaultSettings.focusSound,
    focusSoundVolume: typeof value.focusSoundVolume === "number" && Number.isFinite(value.focusSoundVolume) && value.focusSoundVolume >= 0 && value.focusSoundVolume <= 1 ? value.focusSoundVolume : defaultSettings.focusSoundVolume,
    focusSoundDuringBreak: typeof value.focusSoundDuringBreak === "boolean" ? value.focusSoundDuringBreak : defaultSettings.focusSoundDuringBreak,
  };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
