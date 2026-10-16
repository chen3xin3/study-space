import { useCallback, useEffect, useRef, useState } from "react";
import type { StudyTask } from "../domain/task";
import type { CreateTaskInput, TaskService } from "../services/task-service";

export type TasksStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误";
}

export function useTasks(service: TaskService) {
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [status, setStatus] = useState<TasksStatus>({ kind: "loading" });
  const [isSaving, setIsSaving] = useState(false);
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setStatus({ kind: "loading" });

    try {
      const loaded = await service.list();
      if (version !== requestVersion.current) return;
      setTasks(loaded);
      setStatus({ kind: "ready" });
    } catch (error: unknown) {
      if (version !== requestVersion.current) return;
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, [service]);

  useEffect(() => {
    void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [reload]);

  const create = async (input: CreateTaskInput): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    try {
      const created = await service.create(input);
      setTasks((current) => [...current, created]);
      setStatus({ kind: "ready" });
      return true;
    } catch (error: unknown) {
      setStatus({ kind: "error", message: errorMessage(error) });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = async (id: string): Promise<void> => {
    try {
      const changed = await service.toggle(id);
      setTasks((current) => current.map((task) => task.id === id ? changed : task));
      setStatus({ kind: "ready" });
    } catch (error: unknown) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  };

  return { tasks, status, isSaving, reload, create, toggle };
}
