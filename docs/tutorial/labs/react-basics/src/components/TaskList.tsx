import type { StudyTask } from "../domain/task";

interface TaskListProps {
  tasks: StudyTask[];
  onToggle: (id: string) => void;
}

export function TaskList({ tasks, onToggle }: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="empty-state">当前筛选条件下没有任务。</p>;
  }

  return (
    <ul className="task-list" aria-label="学习任务">
      {tasks.map((task) => (
        <li key={task.id} className="task-item">
          <div>
            <strong className={task.completed ? "is-completed" : undefined}>
              {task.title}
            </strong>
            <span>{task.subject}</span>
          </div>
          <button type="button" onClick={() => onToggle(task.id)}>
            {task.completed ? "恢复" : "完成"}
          </button>
        </li>
      ))}
    </ul>
  );
}
