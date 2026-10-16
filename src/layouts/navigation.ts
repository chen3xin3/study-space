import {
  BookOpenText,
  Calculator,
  ChartNoAxesCombined,
  Flag,
  GraduationCap,
  House,
  LibraryBig,
  Settings2,
  TimerReset,
} from "lucide-react";
import type { NavigationGroup, NavigationGroupKey, NavigationItem } from "../types/navigation";

export const navigationItems: NavigationItem[] = [
  { to: "/", label: "首页", key: "dashboard", group: "overview", tone: "green", icon: House },
  { to: "/focus", label: "专注学习", key: "focus", group: "overview", tone: "teal", icon: TimerReset },
  { to: "/english", label: "英语", key: "english", group: "subjects", tone: "blue", icon: BookOpenText },
  { to: "/math", label: "数学", key: "math", group: "subjects", tone: "amber", icon: Calculator },
  { to: "/specialty", label: "专业课", key: "specialty", group: "subjects", tone: "violet", icon: GraduationCap },
  { to: "/politics", label: "政治", key: "politics", group: "subjects", tone: "rose", icon: Flag },
  { to: "/statistics", label: "学习统计", key: "statistics", group: "tools", tone: "slate", icon: ChartNoAxesCombined },
  { to: "/library", label: "资料库", key: "library", group: "tools", tone: "gold", icon: LibraryBig },
  { to: "/settings", label: "设置", key: "settings", group: "system", tone: "neutral", icon: Settings2 },
];

const groupLabels: Record<NavigationGroupKey, string> = {
  overview: "总览",
  subjects: "备考科目",
  tools: "学习工具",
  system: "系统",
};

export const navigationGroups: NavigationGroup[] = (["overview", "subjects", "tools", "system"] as const).map((key) => ({
  key,
  label: groupLabels[key],
  items: navigationItems.filter((item) => item.group === key),
}));
