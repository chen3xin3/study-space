import test from "node:test";
import assert from "node:assert/strict";

import {
  addTask,
  createTask,
  filterTasks,
  findTask,
  toggleTask,
} from "./task-store.js";

test("createTask 清理文字并建立未完成任务", () => {
  assert.deepEqual(createTask("task-1", "  整理阅读错题  ", "  英语  "), {
    id: "task-1",
    title: "整理阅读错题",
    subject: "英语",
    completed: false,
  });
});

test("createTask 在科目为空时使用其他", () => {
  assert.equal(createTask("task-1", "复习", "   ").subject, "其他");
});

test("createTask 拒绝空标题", () => {
  assert.throws(
    () => createTask("task-1", "   ", "英语"),
    new Error("任务标题不能为空"),
  );
});

test("addTask 返回新数组且不修改原数组", () => {
  const original = [createTask("task-1", "复习单词", "英语")];
  const added = createTask("task-2", "整理错题", "数学");
  const result = addTask(original, added);

  assert.deepEqual(result, [...original, added]);
  assert.notEqual(result, original);
  assert.equal(original.length, 1);
});

test("toggleTask 只切换目标任务并保持不可变更新", () => {
  const first = createTask("task-1", "复习单词", "英语");
  const second = createTask("task-2", "整理错题", "数学");
  const original = [first, second];
  const result = toggleTask(original, "task-2");

  assert.notEqual(result, original);
  assert.equal(result[0], first);
  assert.notEqual(result[1], second);
  assert.equal(result[1].completed, true);
  assert.equal(original[1].completed, false);
});

test("toggleTask 遇到未知 id 时返回内容不变的新数组", () => {
  const original = [createTask("task-1", "复习单词", "英语")];
  const result = toggleTask(original, "missing");

  assert.deepEqual(result, original);
  assert.notEqual(result, original);
});

test("findTask 找到任务，未知 id 返回 undefined", () => {
  const tasks = [createTask("task-1", "复习单词", "英语")];

  assert.equal(findTask(tasks, "task-1"), tasks[0]);
  assert.equal(findTask(tasks, "missing"), undefined);
});

test("filterTasks 支持全部、未完成和已完成", () => {
  const pending = createTask("task-1", "复习单词", "英语");
  const completed = {
    ...createTask("task-2", "整理错题", "数学"),
    completed: true,
  };
  const tasks = [pending, completed];

  assert.deepEqual(filterTasks(tasks, "all"), tasks);
  assert.deepEqual(filterTasks(tasks, "pending"), [pending]);
  assert.deepEqual(filterTasks(tasks, "completed"), [completed]);
});

test("filterTasks 拒绝未知筛选条件", () => {
  assert.throws(
    () => filterTasks([], "tomorrow"),
    new Error("未知筛选条件"),
  );
});
