const STARTER_TASKS = [
  {
    id: "starter-english",
    title: "整理一页阅读错题",
    subject: "英语",
    completed: false,
  },
  {
    id: "starter-math",
    title: "复盘一道数学错题",
    subject: "数学",
    completed: false,
  },
];

export function loadStarterTasks({ delay = 600, shouldFail = false } = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error("模拟加载失败"));
        return;
      }

      resolve(STARTER_TASKS.map((task) => ({ ...task })));
    }, delay);
  });
}
