import { addTask, buildSevenDaySummary, removeTask, toggleTask } from "./tasks";

describe("daily task domain", () => {
  it("trims a new task and keeps newest tasks first", () => {
    const first = addTask([], "  背英语作文  ", new Date("2026-10-14T08:00:00Z"));
    const second = addTask(first, "整理错题", new Date("2026-10-15T08:00:00Z"));
    expect(second.map((task) => task.title)).toEqual(["整理错题", "背英语作文"]);
  });

  it("toggles without mutating the original array and soft deletes", () => {
    const tasks = addTask([], "整理错题", new Date("2026-10-15T08:00:00Z"));
    const toggled = toggleTask(tasks, tasks[0].id);
    const removed = removeTask(toggled, tasks[0].id);
    expect(tasks[0].completed).toBe(false);
    expect(toggled[0].completed).toBe(true);
    expect(removed[0].deletedAt).toBeTruthy();
  });

  it("zero fills all seven dates", () => {
    const summary = buildSevenDaySummary(
      [{ date: "2026-10-14", minutes: 30 }],
      new Date("2026-10-15T12:00:00"),
    );
    expect(summary).toHaveLength(7);
    expect(summary.at(-2)).toEqual({ date: "2026-10-14", minutes: 30 });
    expect(summary.at(-1)).toEqual({ date: "2026-10-15", minutes: 0 });
  });
});
