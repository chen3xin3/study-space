import { AlertTriangle, BookOpenText, Coffee, Pause, Play, Square } from "lucide-react";
import type { CSSProperties } from "react";
import type { FocusSession } from "../../../services/focus/focus.types";
import type { FocusClockState } from "../useFocusClock";

const subjectNames = { english: "英语", math: "数学", specialty: "专业课", politics: "政治", other: "其他" };
const formatTime = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 3600)).padStart(2, "0")}:${String(Math.floor(Math.max(0, seconds) % 3600 / 60)).padStart(2, "0")}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
const formatDuration = (seconds: number) => {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
};

export interface FocusTimerStageProps {
  session: FocusSession;
  clock: FocusClockState;
  busy: boolean;
  interruptionCount: number;
  onPause(): void;
  onResume(): void;
  onStartBreak(): void;
  onNextCycle(): void;
  onInterrupt(): void;
  onFinish(): void;
}

export function FocusTimerStage({ session, clock, busy, interruptionCount, onPause, onResume, onStartBreak, onNextCycle, onInterrupt, onFinish }: FocusTimerStageProps) {
  const isLongBreak = session.phase === "break" && session.cycleNumber % session.longBreakAfterCycles === 0;
  const title = session.phase === "break" ? (isLongBreak ? "长休息" : "短休息") : session.mode === "open" ? "自由专注" : `第 ${session.cycleNumber} 轮专注`;
  const status = session.phase === "break" ? "休息中" : session.timer.status === "running" ? "专注中" : "已暂停";
  return <section className="focus-stage focus-timer-stage" aria-label="专注计时" data-art-direction="spectrum-console">
    <div className="focus-spectrum-wave" data-testid="focus-spectrum-wave" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
    <div className="focus-stage__top"><span>{session.phase === "break" ? <Coffee size={18} /> : <BookOpenText size={18} />}{title}</span><span className="focus-stage__context">{subjectNames[session.subject]}<strong className={`focus-stage__status is-${session.phase === "break" ? "break" : session.timer.status}`}>{status}</strong></span></div>
    <div className="focus-cycle-map" aria-label={`第 ${session.cycleNumber} 轮，共 ${session.cyclesPerSet} 轮`}>
      {Array.from({ length: session.cyclesPerSet }, (_, index) => {
        const cycleNumber = index + 1;
        const cycleProgress = cycleNumber < session.cycleNumber ? 100 : cycleNumber === session.cycleNumber ? (session.phase === "break" ? 100 : clock.progress) : 0;
        return <i key={index} className={cycleNumber < session.cycleNumber ? "is-done" : cycleNumber === session.cycleNumber ? "is-current" : ""} style={{ "--cycle-progress": `${cycleProgress}%` } as CSSProperties}><span>{cycleNumber}</span></i>;
      })}
    </div>
    <div className="focus-clock" aria-live="off">{formatTime(clock.remaining)}</div>
    <p className="focus-goal">{session.goal || "专注当下，慢慢积累。"}</p>
    {session.mode === "pomodoro" && <div className="focus-progress" aria-label={`本轮进度 ${clock.progress}%`}><span style={{ width: `${clock.progress}%` }} /></div>}
    <div className="focus-session-meta"><span><small>有效学习</small><strong>{formatDuration(clock.elapsed)}</strong></span><span><small>{session.phase === "break" ? "休息时长" : "本轮进度"}</small><strong>{session.phase === "break" ? `${Math.round(clock.activeBreakSeconds / 60)} 分钟` : session.mode === "pomodoro" ? `${clock.progress}%` : "正向计时"}</strong></span><span><small>中断</small><strong>{interruptionCount} 次</strong></span></div>
    <div className="focus-actions">
      {session.phase === "break" ? <button className="primary-button" disabled={busy} onClick={onNextCycle}><Play size={17} />结束休息，开始第 {session.cycleNumber + 1} 轮</button> : <>
        <button className="secondary-button" disabled={busy} onClick={session.timer.status === "running" ? onPause : onResume}>{session.timer.status === "running" ? <Pause size={17} /> : <Play size={17} />}{session.timer.status === "running" ? "暂停" : "继续"}</button>
        {session.mode === "pomodoro" && session.breakSeconds > 0 && <button className="secondary-button" disabled={busy} onClick={onStartBreak}><Coffee size={17} />开始休息</button>}
        <button className="secondary-button" disabled={busy} onClick={onInterrupt}><AlertTriangle size={16} />记录中断</button>
      </>}
      <button className="focus-stop" disabled={busy} onClick={onFinish}><Square size={15} />结束并复盘</button>
    </div>
  </section>;
}
