import { createTask } from "../domain/task-operations";
import type { StudyTask } from "../domain/task";
import type { CreateTaskInput, TaskService } from "./task-service";

interface InMemoryTaskServiceOptions {
  delay?: number;
  initialTasks?: StudyTask[];
}

const defaultTasks: StudyTask[] = [
  createTask("starter-1", "整理一页阅读错题", "英语"),
];

function cloneTask(task: StudyTask): StudyTask {
  return { ...task };
}

export class InMemoryTaskService implements TaskService {
  private tasks: StudyTask[];
  private readonly delay: number;

  constructor({
    delay = 300,
    initialTasks = defaultTasks,
  }: InMemoryTaskServiceOptions = {}) {
    this.delay = delay;
    this.tasks = initialTasks.map(cloneTask);
  }

  async list(): Promise<StudyTask[]> {
    await this.wait();
    return this.tasks.map(cloneTask);
  }

  async create(input: CreateTaskInput): Promise<StudyTask> {
    await this.wait();
    const task = createTask(crypto.randomUUID(), input.title, input.subject);
    this.tasks = [...this.tasks, task];
    return cloneTask(task);
  }

  async toggle(id: string): Promise<StudyTask> {
    await this.wait();
    const existing = this.tasks.find((task) => task.id === id);

    if (!existing) {
      throw new Error("任务不存在");
    }

    const changed = { ...existing, completed: !existing.completed };
    this.tasks = this.tasks.map((task) => task.id === id ? changed : task);
    return cloneTask(changed);
  }

  private async wait(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.delay);
    });
  }
}
