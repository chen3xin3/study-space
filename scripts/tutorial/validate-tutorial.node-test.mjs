import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { validateTutorial } from "./validate-tutorial.mjs";

const headings = [
  "本章目标",
  "开始前需要会什么",
  "新术语表",
  "先建立直觉",
  "图解",
  "跟我一步一步做",
  "完整示例",
  "逐段解释",
  "运行并观察",
  "常见错误与修复",
  "在“学习空间”项目里找到它",
  "必做练习",
  "选做挑战",
  "答案与思路",
  "本章自检",
  "本章小结",
  "下一章",
];

async function fixture(
  body,
  { folder = "01-准备篇", filename = "01-示例.md" } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), "tutorial-validator-"));
  const chapterDir = path.join(root, folder);
  await mkdir(chapterDir, { recursive: true });
  const file = path.join(chapterDir, filename);
  await writeFile(file, body, "utf8");
  return { root, file };
}

function validLesson(extra = "") {
  const sections = headings
    .map((heading) => `## ${heading}\n\n这是可学习的正文。`)
    .join("\n\n");

  return `---\ntitle: "示例"\nchapter: 1\nstage: "准备篇"\nstatus: "可学习"\nestimated_minutes: 60\nprerequisites: []\nlast_verified: "2026-10-12"\nproject_version: "0.6.0"\nknowledge_type: "通用知识"\n---\n\n${sections}\n${extra}`;
}

test("accepts a complete lesson", async () => {
  const { root } = await fixture(validLesson());
  const result = await validateTutorial(root, {
    requiredFiles: ["01-准备篇/01-示例.md"],
  });
  assert.deepEqual(result.errors, []);
});

test("reports a missing required section", async () => {
  const { root } = await fixture(
    validLesson().replace("## 答案与思路", "## 参考内容"),
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["01-准备篇/01-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：答案与思路/);
});

test("rejects placeholder language", async () => {
  const { root } = await fixture(validLesson("\nTODO：以后再写。"));
  const result = await validateTutorial(root, {
    requiredFiles: ["01-准备篇/01-示例.md"],
  });
  assert.match(result.errors.join("\n"), /占位内容/);
});

test("reports a broken relative markdown link", async () => {
  const { root } = await fixture(validLesson("\n[不存在](./missing.md)"));
  const result = await validateTutorial(root, {
    requiredFiles: ["01-准备篇/01-示例.md"],
  });
  assert.match(result.errors.join("\n"), /链接目标不存在/);
});

test("validates required sections in a phase-two lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "02-Web基础篇", filename: "07-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["02-Web基础篇/07-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in a phase-three lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "03-TypeScript与React篇", filename: "13-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["03-TypeScript与React篇/13-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in a Tauri and Rust lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "04-Tauri与Rust篇", filename: "21-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["04-Tauri与Rust篇/21-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in a SQLite lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "05-SQLite与本地数据篇", filename: "26-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["05-SQLite与本地数据篇/26-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in a teaching-app lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "06-从零实现学习空间篇", filename: "31-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["06-从零实现学习空间篇/31-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in a complete-business lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "07-完整业务模块篇", filename: "37-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["07-完整业务模块篇/37-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in a quality lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "08-质量安全与发布篇", filename: "42-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["08-质量安全与发布篇/42-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("validates required sections in an independent-development lesson", async () => {
  const { root } = await fixture(
    validLesson().replace("## 图解", "## 示意内容"),
    { folder: "09-独立开发能力篇", filename: "46-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["09-独立开发能力篇/46-示例.md"],
  });
  assert.match(result.errors.join("\n"), /缺少章节：图解/);
});

test("reports a broken relative lab link", async () => {
  const { root } = await fixture(
    validLesson("\n[实验页](../labs/web-basics/missing.html)"),
    { folder: "02-Web基础篇", filename: "07-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["02-Web基础篇/07-示例.md"],
  });
  assert.match(result.errors.join("\n"), /链接目标不存在/);
});

test("reports a broken TypeScript lab link", async () => {
  const { root } = await fixture(
    validLesson("\n[组件](../labs/react-basics/src/missing.tsx)"),
    { folder: "03-TypeScript与React篇", filename: "13-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["03-TypeScript与React篇/13-示例.md"],
  });
  assert.match(result.errors.join("\n"), /链接目标不存在/);
});

test("reports broken Rust source and Cargo manifest links", async () => {
  const { root } = await fixture(
    validLesson("\n[源码](../labs/backend-basics/src/missing.rs)\n[清单](../labs/backend-basics/Cargo.toml)"),
    { folder: "04-Tauri与Rust篇", filename: "21-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["04-Tauri与Rust篇/21-示例.md"],
  });
  assert.equal(result.errors.filter((error) => error.includes("链接目标不存在")).length, 2);
});

test("reports a broken teaching-app component link", async () => {
  const { root } = await fixture(
    validLesson("\n[应用组件](../labs/study-space-app/src/app/missing.tsx)"),
    { folder: "06-从零实现学习空间篇", filename: "31-示例.md" },
  );
  const result = await validateTutorial(root, {
    requiredFiles: ["06-从零实现学习空间篇/31-示例.md"],
  });
  assert.match(result.errors.join("\n"), /链接目标不存在/);
});

test("accepts an existing relative lab link", async () => {
  const { root } = await fixture(
    validLesson("\n[实验页](../labs/web-basics/index.html)"),
    { folder: "02-Web基础篇", filename: "07-示例.md" },
  );
  const labDir = path.join(root, "labs", "web-basics");
  await mkdir(labDir, { recursive: true });
  await writeFile(path.join(labDir, "index.html"), "<!doctype html>", "utf8");

  const result = await validateTutorial(root, {
    requiredFiles: ["02-Web基础篇/07-示例.md"],
  });
  assert.deepEqual(result.errors, []);
});
