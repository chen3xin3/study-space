import { useEffect, useState } from "react";
import { elapsedWorkMs, finishSession, pauseSession, recordInterruption, resumeSession, startBreak, startSession, type FocusSession } from "../domain/focus-clock";

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return hours + ":" + minutes + ":" + seconds;
}

export function FocusPage() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = session ? elapsedWorkMs(session, now) : 0;
  return <section className="focus-page">
    <header className="focus-heading"><div><p className="eyebrow">专注控制台</p><h1>专注学习</h1><p>选择一件事，在这一轮里只做它。</p></div><div className="today-focus"><span>本轮有效学习</span><strong>{Math.floor(elapsed / 60000)} 分钟</strong></div></header>
    <div className="focus-layout">
      <article className="focus-stage">
        <div className="signal-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <div className="focus-task">{session?.task ?? "准备开始一轮自由学习"}</div>
        <div className="timer">{formatTime(elapsed)}</div>
        <div className="focus-metrics"><span>状态<strong>{session?.status ?? "未开始"}</strong></span><span>中断<strong>{session?.interruptions.length ?? 0} 次</strong></span><span>规则<strong>休息不计时</strong></span></div>
        <div className="focus-actions">
          {!session || session.status === "finished" ? <button className="primary-action" onClick={() => setSession(startSession("自由学习"))}>开始专注</button> : null}
          {session?.status === "running" ? <button onClick={() => setSession(pauseSession(session))}>暂停</button> : null}
          {session && (session.status === "paused" || session.status === "break") ? <button className="primary-action" onClick={() => setSession(resumeSession(session))}>继续</button> : null}
          {session && session.status !== "finished" ? <>
            <button onClick={() => setSession(startBreak(session))}>开始休息</button>
            <button onClick={() => setSession(recordInterruption(session, "手动记录"))}>记录中断</button>
            <button className="danger-action" onClick={() => setSession(finishSession(session, Date.now(), 4, "完成本轮"))}>结束并复盘</button>
          </> : null}
        </div>
      </article>
      <aside className="task-rail">
        <div className="rail-title"><div><p>任务轨道</p><h2>今天准备做</h2></div><button aria-label="添加专注任务">＋</button></div>
        {["整理英语试卷", "高数极限专项", "背诵政治考点"].map((task, index) => <button className="rail-task" key={task} onClick={() => setSession(startSession(task))}><span className={"task-color color-" + index} /><span><small>{["英语", "数学", "政治"][index]}</small><strong>{task}</strong></span><b>▷</b></button>)}
        <div className="environment-chip">● 环境音：雨夜书房 <button>调整</button></div>
      </aside>
    </div>
    <nav className="focus-tools" aria-label="专注工具"><button>设置</button><button>环境</button><button>沉浸</button><button>统计</button></nav>
  </section>;
}
