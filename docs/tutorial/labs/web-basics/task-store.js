export function createTask(id, title, subject) {
  const normalizedTitle = title.trim();
  const normalizedSubject = subject.trim() || "其他";

  if (!normalizedTitle) {
    throw new Error("任务标题不能为空");
  }

  return {
    id,
    title: normalizedTitle,
    subject: normalizedSubject,
    completed: false,
  };
}

export function addTask(tasks, task) {
  return [...tasks, task];
}

export function toggleTask(tasks, id) {
  return tasks.map((task) => (
    task.id === id
      ? { ...task, completed: !task.completed }
      : task
  ));
}

export function findTask(tasks, id) {
  return tasks.find((task) => task.id === id);
}

export function filterTasks(tasks, filter) {
  if (filter === "all") {
    return [...tasks];
  }

  if (filter === "pending") {
    return tasks.filter((task) => !task.completed);
  }

  if (filter === "completed") {
    return tasks.filter((task) => task.completed);
  }

  throw new Error("未知筛选条件");
}
