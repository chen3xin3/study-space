import { Pause, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import type { StudyTimer } from "../../services/dashboard/dashboard.types";
import { Card } from "../ui/Card";
import { Link, useInRouterContext } from "react-router";

export function formatStudyTime(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}小时${rest}分钟`;
  if (hours) return `${hours}小时`;
  return `${rest}分钟`;
}

export function StudyTimerCard({ todaySeconds, timer, busy, onStart, onPause, onResume, onEnd }: { todaySeconds: number; timer: StudyTimer | null; busy: boolean; onStart: () => void; onPause: () => void; onResume: () => void; onEnd: () => void }) {
  const inRouter = useInRouterContext();
  const [now, setNow] = useState(Date.now());
  const [snapshotAt, setSnapshotAt] = useState(Date.now());
  useEffect(() => { setSnapshotAt(Date.now()); setNow(Date.now()); }, [timer, todaySeconds]);
  useEffect(() => { if (timer?.status !== "running") return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [timer?.status]);
  const activeSeconds = timer?.status === "running" ? Math.max(0, Math.floor((now - snapshotAt) / 1000)) : 0;
  return <Card className="focus-card timer-card" aria-label="今日学习时间">
    <div className="focus-card__heading"><span><Play size={19} />今日学习时间</span><small>{timer?.status === "running" ? "计时中" : timer?.status === "paused" ? "已暂停" : "准备开始"}</small></div>
    <strong className="timer-card__time">{formatStudyTime(todaySeconds + activeSeconds)}</strong>
    <div className="timer-card__actions">{!timer ? <button className="primary-button" type="button" disabled={busy} onClick={onStart}><Play size={16} />开始学习</button> : timer.status === "running" ? <><button className="secondary-button" type="button" disabled={busy} onClick={onPause}><Pause size={16} />暂停</button><button className="timer-end-button" type="button" disabled={busy} onClick={onEnd}><Square size={15} />结束</button></> : <><button className="primary-button" type="button" disabled={busy} onClick={onResume}><Play size={16} />继续学习</button><button className="timer-end-button" type="button" disabled={busy} onClick={onEnd}><Square size={15} />结束</button></>}</div>
    {inRouter && <Link className="timer-card__focus-link" to="/focus">进入专注空间 →</Link>}
  </Card>;
}
