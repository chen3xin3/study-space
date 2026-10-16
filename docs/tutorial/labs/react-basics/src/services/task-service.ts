import type { StudySubject, StudyTask } from "../domain/task";

export type CreateTaskInput = Pick<StudyTask, "title" | "subject">;

export interface TaskService {
  list(): Promise<StudyTask[]>;
  create(input: CreateTaskInput): Promise<StudyTask>;
  toggle(id: string): Promise<StudyTask>;
}

export type { StudySubject, StudyTask };
