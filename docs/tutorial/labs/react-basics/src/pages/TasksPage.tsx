import { useState } from "react";
import { TaskForm, type TaskFormValues } from "../components/TaskForm";
import { TaskList } from "../components/TaskList";
import type { TaskFilter } from "../domain/task";
import { filterTasks } from "../domain/task-operations";
import { useTasks } from "../hooks/useTasks";
import type { TaskService } from "../services/task-service";

const initialForm: TaskFormValues = { title: "", subject: "英语" };
const filterLabels: Record<TaskFilter, string> = { all: "全部", pending: "待完成", completed: "已完成" };

export function TasksPage({ service }: { service: TaskService }) {
  const { tasks, status, isSaving, reload, create, toggle } = useTasks(service);
  const [form, setForm] = useState<TaskFormValues>(initialForm);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError("请输入任务名称"); return; }
    if (await create({ title: form.title.trim(), subject: form.subject })) {
      setForm(initialForm);
      setError("");
    }
  };

  return (
    <main className="page-content">
      <p className="eyebrow">任务练习</p>
      <h1>今日学习任务</h1>
      <p className="intro">把任务拆小，完成一件，再开始下一件。</p>
      <section className="lesson-card" aria-labelledby="task-section-title">
        <h2 id="task-section-title">任务清单</h2>
        <TaskForm values={form} onTitleChange={(title) => setForm((old) => ({ ...old, title }))}
          onSubjectChange={(subject) => setForm((old) => ({ ...old, subject }))}
          onSubmit={handleSubmit} error={error} disabled={isSaving} />
        {status.kind === "loading" && tasks.length === 0 ? <p role="status">正在加载任务…</p> : null}
        {status.kind === "error" ? <div className="load-error" role="alert"><p>{status.message}</p><button type="button" onClick={() => void reload()}>重新加载</button></div> : null}
        <button className="reload-button" type="button" onClick={() => void reload()}>刷新任务</button>
        <div className="task-filters" aria-label="筛选任务">
          {(Object.keys(filterLabels) as TaskFilter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{filterLabels[value]}</button>)}
        </div>
        <p className="task-count" aria-live="polite">已完成 {tasks.filter((task) => task.completed).length} / {tasks.length}</p>
        <TaskList tasks={filterTasks(tasks, filter)} onToggle={(id) => void toggle(id)} />
      </section>
    </main>
  );
}
