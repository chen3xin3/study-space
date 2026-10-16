export type StudyTask = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  deletedAt: string | null;
};

export type DailyMinutes = { date: string; minutes: number };

export function addTask(tasks: StudyTask[], title: string, now = new Date()): StudyTask[] {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("任务名称不能为空");
  const task: StudyTask = {
    id: String(now.getTime()) + "-" + cleanTitle,
    title: cleanTitle,
    completed: false,
    createdAt: now.toISOString(),
    deletedAt: null,
  };
  return [task, ...tasks];
}

export function toggleTask(tasks: StudyTask[], id: string): StudyTask[] {
  return tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task);
}

export function removeTask(tasks: StudyTask[], id: string, now = new Date()): StudyTask[] {
  return tasks.map((task) => task.id === id ? { ...task, deletedAt: now.toISOString() } : task);
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function buildSevenDaySummary(records: DailyMinutes[], today = new Date()): DailyMinutes[] {
  const minutesByDate = new Map(records.map((item) => [item.date, item.minutes]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = localDate(date);
    return { date: key, minutes: minutesByDate.get(key) ?? 0 };
  });
}
