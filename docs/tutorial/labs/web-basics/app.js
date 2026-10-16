import {
  addTask,
  createTask,
  filterTasks,
  toggleTask,
} from "./task-store.js";
import { loadStarterTasks } from "./fake-api.js";

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const subjectSelect = document.querySelector("#task-subject");
const taskList = document.querySelector("#task-list");
const taskSummary = document.querySelector("#task-summary");
const filterButtons = document.querySelectorAll("[data-filter]");
const requestStatus = document.querySelector("#request-status");
const loadFakeButton = document.querySelector("#load-fake-tasks");
const simulateFailureButton = document.querySelector("#simulate-failure");
const loadJsonButton = document.querySelector("#load-json-tasks");
const retryButton = document.querySelector("#retry-load");
const loadButtons = [loadFakeButton, simulateFailureButton, loadJsonButton];

let tasks = [];
let currentFilter = "all";
let lastRetry = null;

function showStatus(message, state = "idle") {
  requestStatus.textContent = message;
  requestStatus.dataset.state = state;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "发生了未知错误";
}

function makeTaskId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeTaskItem(task) {
  const item = document.createElement("li");
  item.className = "task-item";
  item.dataset.completed = String(task.completed);

  const copy = document.createElement("div");
  copy.className = "task-copy";

  const subject = document.createElement("span");
  subject.textContent = task.subject;

  const title = document.createElement("strong");
  title.textContent = task.title;

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.dataset.taskId = task.id;
  toggleButton.textContent = task.completed ? "恢复为未完成" : "标记完成";
  toggleButton.setAttribute("aria-pressed", String(task.completed));

  copy.append(subject, title);
  item.append(copy, toggleButton);

  return item;
}

function renderSummary() {
  const completedCount = tasks.filter((task) => task.completed).length;
  taskSummary.textContent = `${completedCount} / ${tasks.length} 已完成`;
}

function renderTasks() {
  const visibleTasks = filterTasks(tasks, currentFilter);
  taskList.replaceChildren();

  if (visibleTasks.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "empty-state";
    emptyState.textContent = tasks.length === 0
      ? "还没有任务，请使用上方表单添加。"
      : "当前筛选条件下没有任务。";
    taskList.append(emptyState);
  } else {
    taskList.append(...visibleTasks.map(makeTaskItem));
  }

  renderSummary();
}

function mergeTasks(currentTasks, incomingTasks) {
  const incomingIds = new Set(incomingTasks.map((task) => task.id));
  return [
    ...currentTasks.filter((task) => !incomingIds.has(task.id)),
    ...incomingTasks.map((task) => ({ ...task })),
  ];
}

function setLoading(isLoading) {
  for (const button of loadButtons) {
    button.disabled = isLoading;
  }
  retryButton.disabled = isLoading;
}

async function loadTasksFromJson() {
  const response = await fetch("./sample-tasks.json");

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  return response.json();
}

async function runTaskLoad(loader, successMessage, retryLoader = loader) {
  setLoading(true);
  retryButton.hidden = true;
  showStatus("正在加载示例任务…", "loading");

  try {
    const loadedTasks = await loader();
    tasks = mergeTasks(tasks, loadedTasks);
    renderTasks();
    showStatus(successMessage, "success");
    lastRetry = null;
  } catch (error) {
    console.error("加载示例任务失败", error);
    showStatus(getErrorMessage(error), "error");
    lastRetry = retryLoader;
    retryButton.hidden = false;
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    const task = createTask(
      makeTaskId(),
      titleInput.value,
      subjectSelect.value,
    );

    tasks = addTask(tasks, task);
    form.reset();
    titleInput.focus();
    renderTasks();
    showStatus(`已添加任务：${task.title}`, "success");
  } catch (error) {
    console.error("添加任务失败", error);
    showStatus(getErrorMessage(error), "error");
    titleInput.focus();
  }
});

taskList.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("button[data-task-id]");

  if (!toggleButton) {
    return;
  }

  tasks = toggleTask(tasks, toggleButton.dataset.taskId);
  renderTasks();
});

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;

    for (const candidate of filterButtons) {
      candidate.setAttribute(
        "aria-pressed",
        String(candidate === button),
      );
    }

    renderTasks();
  });
}

loadFakeButton.addEventListener("click", () => {
  runTaskLoad(
    () => loadStarterTasks(),
    "模拟任务加载成功。",
  );
});

simulateFailureButton.addEventListener("click", () => {
  runTaskLoad(
    () => loadStarterTasks({ shouldFail: true }),
    "模拟任务加载成功。",
    () => loadStarterTasks(),
  );
});

loadJsonButton.addEventListener("click", () => {
  runTaskLoad(
    loadTasksFromJson,
    "本地 JSON 任务加载成功。",
  );
});

retryButton.addEventListener("click", () => {
  if (lastRetry) {
    runTaskLoad(lastRetry, "重新加载成功。", lastRetry);
  }
});

renderTasks();
runTaskLoad(
  () => loadStarterTasks(),
  "初始示例任务加载成功。",
);
