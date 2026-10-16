import type { CSSProperties } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "../ui/Card";

export function DailyProgressCard({ completedTasks, totalTasks }: { completedTasks: number; totalTasks: number }) {
  const percent = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const style = { "--progress": `${percent * 3.6}deg` } as CSSProperties;
  return <Card className="focus-card progress-card" aria-label="今日完成进度">
    <div className="focus-card__heading"><span><CheckCircle2 size={19} />今日完成</span><strong>{percent}%</strong></div>
    <div className="progress-card__body"><div className="progress-ring" style={style} role="progressbar" aria-label="今日任务完成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span>{percent}%</span></div><div><strong>{completedTasks} / {totalTasks}</strong><p>{totalTasks ? "完成一项，就离目标更近一点" : "添加今天的第一项任务"}</p></div></div>
  </Card>;
}
