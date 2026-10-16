import type { ThemeId } from "../services/settings/settings.types";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
}

export const themes: ThemeOption[] = [
  { id: "eye-care", name: "浅绿护眼", description: "清新柔和，适合长时间学习" },
  { id: "macaron", name: "马卡龙", description: "柔和彩色，更有陪伴感" },
  { id: "classic-green", name: "经典深绿", description: "沉稳专注，重点清晰" },
  { id: "minimal-white", name: "极简白色", description: "干净克制，减少视觉干扰" },
  { id: "night", name: "深色夜间", description: "降低夜间环境中的亮度刺激" },
  { id: "soft-gradient", name: "柔和渐变", description: "轻盈梦幻，保持阅读清晰" },
];
