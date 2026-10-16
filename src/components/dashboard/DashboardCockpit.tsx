import { CheckCircle2, Clock3, Flame } from "lucide-react";
import { ExamCountdown } from "./ExamCountdown";
import { formatStudyTime } from "./StudyTimerCard";

interface DashboardCockpitProps {
  completedTasks?: number;
  totalTasks?: number;
  todaySeconds?: number;
  streakDays?: number;
}

export function DashboardCockpit({ completedTasks, totalTasks, todaySeconds, streakDays }: DashboardCockpitProps) {
  const tasksReady = completedTasks !== undefined && totalTasks !== undefined;
  const percent = tasksReady && totalTasks ? Math.round((completedTasks / totalTasks) * 100) : tasksReady ? 0 : undefined;

  return (
    <section className="dashboard-cockpit" data-art-direction="fresh-cockpit" aria-label="备考全局概览">
      <div className="dashboard-cockpit__orbit" aria-hidden="true"><i /><i /><i /></div>
      <ExamCountdown />
      <div className="dashboard-instruments">
        <div className="dashboard-instrument dashboard-instrument--tasks">
          <CheckCircle2 aria-hidden="true" size={20} />
          <span><small>今日任务</small><strong>{percent === undefined ? "—" : `${percent}%`}</strong></span>
          {percent === undefined ? null : <span className="sr-only" role="progressbar" aria-label="今日任务完成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} />}
        </div>
        <div className="dashboard-instrument dashboard-instrument--time">
          <Clock3 aria-hidden="true" size={20} />
          <span><small>今日学习</small><strong>{todaySeconds === undefined ? "—" : formatStudyTime(todaySeconds)}</strong></span>
        </div>
        <div className="dashboard-instrument dashboard-instrument--streak">
          <Flame aria-hidden="true" size={20} />
          <span><small>学习节奏</small><strong>{streakDays === undefined ? "—" : `连续 ${streakDays} 天`}</strong></span>
        </div>
      </div>
    </section>
  );
}
