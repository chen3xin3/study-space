import type { FocusAnalytics } from "../statistics.model";
import { formatFocusDuration } from "./StatisticsOverview";

export function StudyTrendChart({ points }: { points: FocusAnalytics["trend"] }) {
  const max = Math.max(1, ...points.map((item) => item.seconds));
  return <section className="statistics-chart statistics-trend" aria-label="学习时长趋势" role="region"><header><span>学习趋势</span><small>按天统计有效专注</small></header><div className="statistics-trend__bars">{points.map((point) => <div key={point.localDate} aria-label={`${point.localDate} ${formatFocusDuration(point.seconds)}`}><span style={{ height: `${point.seconds ? Math.max(8, point.seconds / max * 100) : 2}%` }} /><small>{point.localDate.slice(5)}</small><b>{formatFocusDuration(point.seconds)}</b></div>)}</div></section>;
}
