export type ThemeId =
  | "eye-care"
  | "macaron"
  | "classic-green"
  | "minimal-white"
  | "night"
  | "soft-gradient";

export type FontScale = "small" | "medium" | "large";
export type Density = "compact" | "comfortable";
export type MathType = "math-1" | "math-2" | "math-3";
export type FocusSound = "off" | "white" | "pink" | "brown";

export interface AppSettings {
  theme: ThemeId;
  fontScale: FontScale;
  density: Density;
  sidebarCollapsed: boolean;
  examDate: string;
  mathType: MathType;
  aiEnabled: boolean;
  focusSound: FocusSound;
  focusSoundVolume: number;
  focusSoundDuringBreak: boolean;
}
