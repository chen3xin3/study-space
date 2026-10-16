import type { LucideIcon } from "lucide-react";

export type NavigationKey =
  | "dashboard"
  | "english"
  | "math"
  | "specialty"
  | "politics"
  | "focus"
  | "statistics"
  | "library"
  | "settings";

export type NavigationGroupKey = "overview" | "subjects" | "tools" | "system";

export type NavigationTone =
  | "green"
  | "blue"
  | "amber"
  | "violet"
  | "rose"
  | "teal"
  | "slate"
  | "gold"
  | "neutral";

export interface NavigationItem {
  to: string;
  label: string;
  key: NavigationKey;
  group: NavigationGroupKey;
  tone: NavigationTone;
  icon: LucideIcon;
}

export interface NavigationGroup {
  key: NavigationGroupKey;
  label: string;
  items: NavigationItem[];
}
