import type { CalendarDaySummary, DashboardSummary } from "../../services/dashboard/dashboard.types";
import type { FocusHistoryItem, FocusSubject } from "../../services/focus/focus.types";

export type StatisticsPeriod = "day" | "week" | "month" | "custom";
export interface StatisticsRange { period: StatisticsPeriod; start: Date; end: Date; label: string }
interface FocusMetric { sessions: number; seconds: number; activeDays: number; averageSeconds: number }
export interface FocusAnalytics {
  allTime: FocusMetric;
  selected: FocusMetric;
  subjects: Array<{ subject: FocusSubject; sessions: number; seconds: number; percent: number }>;
  trend: Array<{ localDate: string; seconds: number; sessions: number }>;
  hourly: Array<{ hour: number; seconds: number; sessions: number }>;
  records: FocusHistoryItem[];
}

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const endOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
const chineseDay = (value: Date) => `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`;
const shortDay = (value: Date) => `${value.getMonth() + 1}月${value.getDate()}日`;

export function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function createStatisticsRange(period: StatisticsPeriod, anchor: Date, customStart?: Date, customEnd?: Date): StatisticsRange {
  if (period === "custom") {
    const first = startOfDay(customStart ?? anchor); const last = endOfDay(customEnd ?? customStart ?? anchor);
    const start = first <= last ? first : startOfDay(last); const end = first <= last ? last : endOfDay(first);
    return { period, start, end, label: `${shortDay(start)} – ${shortDay(end)}` };
  }
  if (period === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    return { period, start, end, label: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月` };
  }
  if (period === "week") {
    const start = startOfDay(anchor); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const end = endOfDay(new Date(start)); end.setDate(end.getDate() + 6);
    return { period, start, end, label: `${shortDay(start)} – ${shortDay(end)}` };
  }
  const start = startOfDay(anchor); const end = endOfDay(anchor);
  return { period, start, end, label: chineseDay(anchor) };
}

export function moveStatisticsRange(period: StatisticsPeriod, anchor: Date, direction: -1 | 1): Date {
  const next = new Date(anchor);
  if (period === "month") next.setMonth(next.getMonth() + direction);
  else next.setDate(next.getDate() + direction * (period === "week" ? 7 : 1));
  return next;
}

function metric(items: FocusHistoryItem[]): FocusMetric {
  const activeDays = new Set(items.map((item) => localDateKey(new Date(item.startedAt)))).size;
  const seconds = items.reduce((sum, item) => sum + item.studySeconds, 0);
  return { sessions: items.length, seconds, activeDays, averageSeconds: activeDays ? Math.round(seconds / activeDays) : 0 };
}

export function createFocusAnalytics(history: FocusHistoryItem[], range: StatisticsRange): FocusAnalytics {
  const records = history.filter((item) => { const time = new Date(item.startedAt).getTime(); return time >= range.start.getTime() && time <= range.end.getTime(); });
  const selected = metric(records);
  const subjects = new Map<FocusSubject, { sessions: number; seconds: number }>();
  for (const item of records) { const current = subjects.get(item.subject) ?? { sessions: 0, seconds: 0 }; subjects.set(item.subject, { sessions: current.sessions + 1, seconds: current.seconds + item.studySeconds }); }
  const subjectReport = [...subjects].map(([subject, value]) => ({ subject, ...value, percent: selected.seconds ? Math.round(value.seconds / selected.seconds * 1000) / 10 : 0 })).sort((a, b) => b.seconds - a.seconds);
  const daily = new Map<string, { seconds: number; sessions: number }>();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0, sessions: 0 }));
  for (const item of records) {
    const started = new Date(item.startedAt); const key = localDateKey(started); const point = daily.get(key) ?? { seconds: 0, sessions: 0 };
    daily.set(key, { seconds: point.seconds + item.studySeconds, sessions: point.sessions + 1 });
    hourly[started.getHours()].seconds += item.studySeconds; hourly[started.getHours()].sessions += 1;
  }
  const trend: FocusAnalytics["trend"] = [];
  for (const cursor = startOfDay(range.start); cursor <= range.end; cursor.setDate(cursor.getDate() + 1)) { const key = localDateKey(cursor); trend.push({ localDate: key, ...(daily.get(key) ?? { seconds: 0, sessions: 0 }) }); }
  return { allTime: metric(history), selected, subjects: subjectReport, trend, hourly, records };
}

const durationText = (seconds: number) => seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分钟`;

export function createStatisticsShareText(report: FocusAnalytics, range: StatisticsRange): string {
  return [`学习统计｜${range.label}`, `专注 ${report.selected.sessions} 次`, `累计 ${durationText(report.selected.seconds)}`, `日均 ${durationText(report.selected.averageSeconds)}`].join("\n");
}

export interface StatisticsReportInput {
  summary: DashboardSummary;
  month: CalendarDaySummary[];
  history: FocusHistoryItem[];
  year: number;
  monthIndex: number;
}

export interface StatisticsReport {
  todaySeconds: number;
  todayTaskPercent: number;
  streakDays: number;
  sevenDaySeconds: number;
  monthSeconds: number;
  monthCompletedTasks: number;
  monthTotalTasks: number;
  subjects: { subject: FocusSubject; seconds: number; sessions: number }[];
}

export function createStatisticsReport(input: StatisticsReportInput): StatisticsReport {
  const monthPrefix = `${input.year}-${String(input.monthIndex + 1).padStart(2, "0")}-`;
  const monthDays = input.month.filter((day) => day.localDate.startsWith(monthPrefix));
  const grouped = new Map<FocusSubject, { seconds: number; sessions: number }>();
  for (const item of input.history) {
    const current = grouped.get(item.subject) ?? { seconds: 0, sessions: 0 };
    grouped.set(item.subject, { seconds: current.seconds + item.studySeconds, sessions: current.sessions + 1 });
  }
  return {
    todaySeconds: input.summary.todaySeconds,
    todayTaskPercent: input.summary.totalTasks ? Math.round(input.summary.completedTasks / input.summary.totalTasks * 100) : 0,
    streakDays: input.summary.streakDays,
    sevenDaySeconds: input.summary.trend.reduce((sum, point) => sum + point.seconds, 0),
    monthSeconds: monthDays.reduce((sum, day) => sum + day.studySeconds, 0),
    monthCompletedTasks: monthDays.reduce((sum, day) => sum + day.completedTasks, 0),
    monthTotalTasks: monthDays.reduce((sum, day) => sum + day.totalTasks, 0),
    subjects: [...grouped].map(([subject, value]) => ({ subject, ...value })).sort((a, b) => b.seconds - a.seconds),
  };
}
