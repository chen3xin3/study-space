import { describe, expect, it } from "vitest";
import { createTask, filterTasks, toggleTask } from "./task-operations";

describe("createTask", () => {
  it("清理标题并创建未完成任务", () => {
    expect(createTask("task-1", "  整理阅读错题  ", "英语")).toEqual({
      id: "task-1",
      title: "整理阅读错题",
      subject: "英语",
      completed: false,
    });
  });

  it("拒绝空标题", () => {
    expect(() => createTask("task-1", "   ", "数学")).toThrow(
      "任务标题不能为空",
    );
  });
});

describe("toggleTask", () => {
  it("返回新数组和新的目标任务，不修改旧数据", () => {
    const original = [createTask("task-1", "复习公式", "数学")];
    const result = toggleTask(original, "task-1");

    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
    expect(result[0]?.completed).toBe(true);
    expect(original[0]?.completed).toBe(false);
  });

  it("未知 id 保持内容不变但仍返回新数组", () => {
    const original = [createTask("task-1", "复习公式", "数学")];
    const result = toggleTask(original, "missing");

    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  });
});

describe("filterTasks", () => {
  const pending = createTask("task-1", "复习单词", "英语");
  const completed = {
    ...createTask("task-2", "整理错题", "数学"),
    completed: true,
  };
  const tasks = [pending, completed];

  it("支持全部、未完成和已完成筛选", () => {
    expect(filterTasks(tasks, "all")).toEqual(tasks);
    expect(filterTasks(tasks, "pending")).toEqual([pending]);
    expect(filterTasks(tasks, "completed")).toEqual([completed]);
  });
});
