import { ListTodo, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DailyTask } from "../../services/dashboard/dashboard.types";
import { Card } from "../ui/Card";

export function DailyTaskList({ tasks, busy, focusRequest = 0, onCreate, onToggle, onDelete }: { tasks: DailyTask[]; busy: boolean; focusRequest?: number; onCreate: (title: string) => Promise<void>; onToggle: (task: DailyTask) => Promise<void>; onDelete: (task: DailyTask) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusRequest > 0) { inputRef.current?.focus(); inputRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); } }, [focusRequest]);
  const add = async () => { if (!title.trim()) { setError("请输入待办内容"); return; } try { await onCreate(title.trim()); setTitle(""); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "添加失败，请重试"); } };
  const act = async (operation: () => Promise<void>) => { try { await operation(); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请重试"); } };
  return <Card className="task-list-card" aria-label="今日待办">
    <div className="focus-card__heading"><span><ListTodo size={20} />今日待办</span><small>{tasks.filter((task) => !task.completedAt).length} 项未完成</small></div>
    <form className="task-add" onSubmit={(event) => { event.preventDefault(); void add(); }}><label className="sr-only" htmlFor="daily-task-title">新增今日待办</label><input ref={inputRef} id="daily-task-title" value={title} maxLength={200} placeholder="今天最重要的一件事…" onChange={(event) => setTitle(event.target.value)} /><button className="primary-button" type="submit" disabled={busy}><Plus size={16} />添加待办</button></form>
    {error ? <p className="task-error" role="alert">{error}</p> : null}
    {tasks.length ? <ul className="daily-task-list">{tasks.map((task) => <li className={task.completedAt ? "is-complete" : ""} key={task.id}><label><input type="checkbox" aria-label={`完成 ${task.title}`} checked={Boolean(task.completedAt)} disabled={busy} onChange={() => void act(() => onToggle(task))} /><span>{task.title}</span></label><button type="button" aria-label={`删除 ${task.title}`} disabled={busy} onClick={() => void act(() => onDelete(task))}><Trash2 size={16} /></button></li>)}</ul> : <div className="task-empty"><strong>今天还没有安排</strong><span>写下一件真正重要的事，开始稳稳推进。</span></div>}
  </Card>;
}
