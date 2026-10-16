import type { StudySubject } from "../domain/task";

export interface TaskFormValues {
  title: string;
  subject: StudySubject;
}

interface TaskFormProps {
  values: TaskFormValues;
  onTitleChange: (title: string) => void;
  onSubjectChange: (subject: StudySubject) => void;
  onSubmit: () => void;
  error?: string;
  disabled?: boolean;
}

const subjects: StudySubject[] = ["英语", "数学", "政治", "专业课", "其他"];

export function TaskForm({
  values,
  onTitleChange,
  onSubjectChange,
  onSubmit,
  error,
  disabled = false,
}: TaskFormProps) {
  return (
    <form
      className="task-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="field">
        <label htmlFor="task-title">任务名称</label>
        <input
          id="task-title"
          disabled={disabled}
          value={values.title}
          onChange={(event) => onTitleChange(event.currentTarget.value)}
          placeholder="例如：整理阅读错题"
        />
      </div>

      <div className="field">
        <label htmlFor="task-subject">科目</label>
        <select
          id="task-subject"
          disabled={disabled}
          value={values.subject}
          onChange={(event) =>
            onSubjectChange(event.currentTarget.value as StudySubject)
          }
        >
          {subjects.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={disabled}>
        {disabled ? "正在保存…" : "添加任务"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}
