export type StudySubject = "英语" | "数学" | "政治" | "专业课" | "其他";

export type TaskFilter = "all" | "pending" | "completed";

export interface StudyTask {
  id: string;
  title: string;
  subject: StudySubject;
  completed: boolean;
}
