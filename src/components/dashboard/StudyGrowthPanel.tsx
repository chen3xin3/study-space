import { Flame, TrendingUp } from "lucide-react";
import type { DailyStudyPoint } from "../../services/dashboard/dashboard.types";
import { Card } from "../ui/Card";

export function StudyGrowthPanel({ streakDays, trend, showStreak = true }: { streakDays: number; trend: DailyStudyPoint[]; showStreak?: boolean }) {
  const max = Math.max(60, ...trend.map((point) => point.seconds));
  return <Card className="growth-card" aria-label="学习成长">{showStreak ? <div className="streak-card"><span className="streak-icon"><Flame size={24} /></span><div><small>保持自己的节奏</small><strong>连续学习 {streakDays} 天</strong></div></div> : null}<div className="trend-panel"><div className="focus-card__heading"><span><TrendingUp size={19} />最近七天</span><small>学习趋势</small></div><div className="study-trend">{trend.map((point, index) => { const [, month, day] = point.localDate.split("-"); const minutes = Math.floor(point.seconds / 60); return <div className="trend-day" key={point.localDate}><span className={index === trend.length - 1 ? "is-today" : ""} aria-label={`${Number(month)}月${Number(day)}日 ${minutes}分钟`} style={{ height: `${Math.max(8, (point.seconds / max) * 88)}px` }} /><small>{index === trend.length - 1 ? "今天" : `${Number(month)}/${Number(day)}`}</small></div>; })}</div></div></Card>;
}
