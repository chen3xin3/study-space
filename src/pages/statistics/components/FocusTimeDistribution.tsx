import type { FocusAnalytics } from "../statistics.model";
import { formatFocusDuration } from "./StatisticsOverview";

export function FocusTimeDistribution({ points }: { points: FocusAnalytics["hourly"] }) {
  const active = points.filter((item) => item.seconds > 0); const max = Math.max(1, ...active.map((item) => item.seconds));
  return <section className="statistics-chart statistics-hours" aria-label="专注时段分布" role="region"><header><span>专注时段</span><small>找到最常进入状态的时间</small></header>{active.length ? <div className="statistics-hours__bars">{active.map((point) => <div key={point.hour} aria-label={`${String(point.hour).padStart(2, "0")}:00 ${formatFocusDuration(point.seconds)}`}><strong>{String(point.hour).padStart(2, "0")}:00</strong><span><i style={{ width: `${Math.max(8, point.seconds / max * 100)}%` }} /></span><small>{formatFocusDuration(point.seconds)} · {point.sessions} 次</small></div>)}</div> : <p className="statistics-empty">这个时间范围还没有可分析的专注时段。</p>}</section>;
}
