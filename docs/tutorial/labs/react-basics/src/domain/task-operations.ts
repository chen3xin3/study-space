import type { StudySubject, StudyTask, TaskFilter } from "./task";

export function createTask(
  id: string,
  title: string,
  subject: StudySubject,
): StudyTask {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error("任务标题不能为空");
  }

  return {
    id,
    title: normalizedTitle,
    subject,
    completed: false,
  };
}

export function toggleTask(tasks: StudyTask[], id: string): StudyTask[] {
  return tasks.map((task) => (
    task.id === id
      ? { ...task, completed: !task.completed }
      : task
  ));
}

export function filterTasks(
  tasks: StudyTask[],
  filter: TaskFilter,
): StudyTask[] {
  if (filter === "pending") {
    return tasks.filter((task) => !task.completed);
  }

  if (filter === "completed") {
    return tasks.filter((task) => task.completed);
  }

  return [...tasks];
}
