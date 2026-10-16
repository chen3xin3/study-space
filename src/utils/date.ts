export type CountdownResult =
  | { status: "unset" }
  | { status: "invalid" }
  | { status: "upcoming"; days: number }
  | { status: "today"; days: 0 }
  | { status: "passed"; days: number };

export function isValidExamDate(examDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return false;
  const [year, month, day] = examDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day;
}

export function calculateCountdown(examDate: string, now = new Date()): CountdownResult {
  if (!examDate) return { status: "unset" };
  if (!isValidExamDate(examDate)) return { status: "invalid" };
  const [year, month, day] = examDate.split("-").map(Number);
  const exam = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const difference = Math.round((exam - today) / 86_400_000);
  if (difference > 0) return { status: "upcoming", days: difference };
  if (difference === 0) return { status: "today", days: 0 };
  return { status: "passed", days: Math.abs(difference) };
}

export function formatLocalTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatLocalDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}
