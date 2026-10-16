import { CalendarCheck2, Clock3, Flame, TimerReset } from "lucide-react";
import type { FocusAnalytics } from "../statistics.model";

export const formatFocusDuration = (seconds: number) => seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分钟`;

export function StatisticsOverview({ analytics }: { analytics: FocusAnalytics }) {
  const cards = [
    { label: "累计专注", value: `${analytics.allTime.sessions} 次`, icon: TimerReset },
    { label: "累计时长", value: formatFocusDuration(analytics.allTime.seconds), icon: Clock3 },
    { label: "日均时长", value: formatFocusDuration(analytics.allTime.averageSeconds), icon: CalendarCheck2 },
    { label: "活跃天数", value: `${analytics.allTime.activeDays} 天`, icon: Flame },
  ];
  return <section className="statistics-overview" aria-label="累计专注概览">{cards.map((card) => { const Icon = card.icon; return <article key={card.label}><Icon /><small>{card.label}</small><strong>{card.value}</strong></article>; })}<div className="statistics-overview__range"><span>当前范围</span><strong>{analytics.selected.sessions} 次 · {formatFocusDuration(analytics.selected.seconds)}</strong><small>活跃 {analytics.selected.activeDays} 天，日均 {formatFocusDuration(analytics.selected.averageSeconds)}</small></div></section>;
}
