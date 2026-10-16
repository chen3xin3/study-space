import { type FormEvent, useMemo, useState } from "react";
import { addTask, buildSevenDaySummary, removeTask, toggleTask, type StudyTask } from "../domain/tasks";

const demoMinutes = [
  { date: "2026-10-12", minutes: 45 },
  { date: "2026-10-14", minutes: 70 },
  { date: "2026-10-15", minutes: 25 },
];

export function DashboardPage() {
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [title, setTitle] = useState("");
  const activeTasks = tasks.filter((task) => !task.deletedAt);
  const summary = useMemo(() => buildSevenDaySummary(demoMinutes), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setTasks((current) => addTask(current, title));
    setTitle("");
  }

  return (
    <section className="dashboard-page">
      <header className="page-heading">
        <div><p className="eyebrow">今日学习</p><h1>把今天安排清楚</h1></div>
        <div className="date-chip">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</div>
      </header>
      <div className="dashboard-grid">
        <article className="panel task-panel">
          <div className="panel-heading"><div><p className="panel-kicker">行动清单</p><h2>今日待办</h2></div><strong>{activeTasks.filter((task) => task.completed).length}/{activeTasks.length}</strong></div>
          <form className="task-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="new-task">新任务</label>
            <input id="new-task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理英语试卷" required />
            <button type="submit" disabled={!title.trim()}>添加任务</button>
          </form>
          {activeTasks.length === 0 ? <p className="empty-state">今天还没有任务，先写下一件最重要的事。</p> : (
            <ul className="task-list">
              {activeTasks.map((task) => <li key={task.id}>
                <label><input type="checkbox" checked={task.completed} onChange={() => setTasks((items) => toggleTask(items, task.id))} /><span>{task.title}</span></label>
                <button type="button" className="quiet-button" onClick={() => setTasks((items) => removeTask(items, task.id))}>移除</button>
              </li>)}
            </ul>
          )}
        </article>
        <article className="panel calendar-panel">
          <p className="panel-kicker">学习节奏</p><h2>学习日历</h2>
          <div className="calendar-grid" aria-label="本月学习日历">{Array.from({ length: 21 }, (_, index) => <span className={index % 4 === 0 ? "has-study" : ""} key={index}>{index + 1}</span>)}</div>
        </article>
        <article className="panel trend-panel">
          <div className="panel-heading"><div><p className="panel-kicker">持续积累</p><h2>最近七天</h2></div><span>分钟</span></div>
          <div className="trend-bars">{summary.map((item) => <div key={item.date}><span style={{ height: String(Math.max(8, item.minutes)) + "px" }} /><small>{item.date.slice(5)}</small></div>)}</div>
        </article>
      </div>
    </section>
  );
}
