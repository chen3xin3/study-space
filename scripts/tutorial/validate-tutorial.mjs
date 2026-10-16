import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REQUIRED_HEADINGS = [
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

export const REQUIRED_TUTORIAL_FILES = [
  "00-课程总目录.md",
  "00-学习方法与进度表.md",
  "01-准备篇/01-软件程序应用与源码.md",
  "01-准备篇/02-文件文件夹路径与扩展名.md",
  "01-准备篇/03-编辑器终端与开发者工具.md",
  "01-准备篇/04-安装开发环境.md",
  "01-准备篇/05-第一次使用命令行.md",
  "01-准备篇/06-Git版本控制入门.md",
  "02-Web基础篇/07-网页由什么组成.md",
  "02-Web基础篇/08-HTML从零入门.md",
  "02-Web基础篇/09-CSS从零入门.md",
  "02-Web基础篇/10-JavaScript基础一.md",
  "02-Web基础篇/11-JavaScript基础二.md",
  "02-Web基础篇/12-异步Promise与网络请求.md",
  "03-TypeScript与React篇/13-为什么需要TypeScript.md",
  "03-TypeScript与React篇/14-泛型类型缩小与实用类型.md",
  "03-TypeScript与React篇/15-npm依赖与Vite.md",
  "03-TypeScript与React篇/16-React组件与JSX.md",
  "03-TypeScript与React篇/17-React状态与事件.md",
  "03-TypeScript与React篇/18-effect与数据加载.md",
  "03-TypeScript与React篇/19-React-Router与应用外壳.md",
  "03-TypeScript与React篇/20-前端架构与服务接口.md",
  "04-Tauri与Rust篇/21-Tauri-2是什么.md",
  "04-Tauri与Rust篇/22-第一次前后端通信.md",
  "04-Tauri与Rust篇/23-Rust基础一.md",
  "04-Tauri与Rust篇/24-Rust基础二.md",
  "04-Tauri与Rust篇/25-Serde错误与异步边界.md",
  "05-SQLite与本地数据篇/26-数据库从零入门.md",
  "05-SQLite与本地数据篇/27-SQL基础.md",
  "05-SQLite与本地数据篇/28-Rust操作SQLite.md",
  "05-SQLite与本地数据篇/29-迁移软删除与版本冲突.md",
  "05-SQLite与本地数据篇/30-事务附件与备份.md",
  "06-从零实现学习空间篇/31-创建项目骨架.md",
  "06-从零实现学习空间篇/32-实现应用外壳与主题.md",
  "06-从零实现学习空间篇/33-实现首页和今日待办.md",
  "06-从零实现学习空间篇/34-实现学习资料系统.md",
  "06-从零实现学习空间篇/35-实现专注计时.md",
  "06-从零实现学习空间篇/36-实现学习照片与文件.md",
  "07-完整业务模块篇/37-首页统计与复习闭环.md",
  "07-完整业务模块篇/38-英语资料模块.md",
  "07-完整业务模块篇/39-数学政治与专业课模块.md",
  "07-完整业务模块篇/40-AI整理与作文AI.md",
  "07-完整业务模块篇/41-设备互联与加密快照.md",
  "08-质量安全与发布篇/42-测试驱动开发.md",
  "08-质量安全与发布篇/43-调试与故障排查.md",
  "08-质量安全与发布篇/44-安全与数据保护.md",
  "08-质量安全与发布篇/45-构建打包与发布.md",
  "09-独立开发能力篇/46-从需求到实现计划.md",
  "09-独立开发能力篇/47-怎样阅读陌生代码.md",
  "09-独立开发能力篇/48-怎样独立查资料和解决问题.md",
  "09-独立开发能力篇/49-毕业项目.md",
  "99-附录/01-中英文术语表.md",
  "99-附录/02-Windows开发环境检查表.md",
  "99-附录/03-PowerShell命令速查.md",
  "99-附录/04-Git安全命令速查.md",
];

const LESSON_FOLDERS = [
  "01-准备篇/",
  "02-Web基础篇/",
  "03-TypeScript与React篇/",
  "04-Tauri与Rust篇/",
  "05-SQLite与本地数据篇/",
  "06-从零实现学习空间篇/",
  "07-完整业务模块篇/",
  "08-质量安全与发布篇/",
  "09-独立开发能力篇/",
];
const CHECKED_LINK_EXTENSIONS = new Set([
  ".md",
  ".html",
  ".css",
  ".js",
  ".json",
  ".ts",
  ".tsx",
  ".rs",
  ".toml",
]);

const FRONTMATTER_KEYS = [
  "title",
  "chapter",
  "stage",
  "status",
  "estimated_minutes",
  "prerequisites",
  "last_verified",
  "project_version",
  "knowledge_type",
];

const PLACEHOLDER_PATTERN = /\bTODO\b|\bTBD\b|待补充|以后再写|占位内容/iu;

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdown(root) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(target);
      }
    }
  }

  if (await exists(root)) {
    await visit(root);
  }

  return files;
}

function normalizedRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function frontmatterOf(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  return match?.[1] ?? "";
}

async function validateLinks(file, content, errors) {
  const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu);

  for (const match of links) {
    const rawTarget = match[1].trim().replace(/^<|>$/gu, "");
    if (
      !rawTarget
      || rawTarget.startsWith("#")
      || /^(https?:|mailto:)/iu.test(rawTarget)
    ) {
      continue;
    }

    const withoutAnchor = rawTarget.split("#", 1)[0];
    const extension = path.extname(withoutAnchor).toLowerCase();
    if (!CHECKED_LINK_EXTENSIONS.has(extension)) {
      continue;
    }

    const target = path.resolve(path.dirname(file), decodeURI(withoutAnchor));
    if (!(await exists(target))) {
      errors.push(`${file}: 链接目标不存在：${rawTarget}`);
    }
  }
}

export async function validateTutorial(root, options = {}) {
  const requiredFiles = options.requiredFiles ?? REQUIRED_TUTORIAL_FILES;
  const errors = [];

  for (const relative of requiredFiles) {
    if (!(await exists(path.join(root, relative)))) {
      errors.push(`缺少文件：${relative}`);
    }
  }

  const markdownFiles = await collectMarkdown(root);
  for (const file of markdownFiles) {
    const content = await readFile(file, "utf8");
    const relative = normalizedRelative(root, file);

    const isLesson = LESSON_FOLDERS.some((folder) => relative.startsWith(folder));
    if (isLesson) {
      const frontmatter = frontmatterOf(content);
      if (!frontmatter) {
        errors.push(`${relative}: 缺少 YAML 属性`);
      }

      for (const key of FRONTMATTER_KEYS) {
        if (!new RegExp(`^${key}:`, "mu").test(frontmatter)) {
          errors.push(`${relative}: 缺少 YAML 属性：${key}`);
        }
      }

      for (const heading of REQUIRED_HEADINGS) {
        if (!content.includes(`## ${heading}`)) {
          errors.push(`${relative}: 缺少章节：${heading}`);
        }
      }
    }

    if (PLACEHOLDER_PATTERN.test(content)) {
      errors.push(`${relative}: 包含占位内容`);
    }

    await validateLinks(file, content, errors);
  }

  return { checkedFiles: markdownFiles.length, errors };
}

const isCli = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCli) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const tutorialRoot = path.resolve(scriptDir, "../../docs/tutorial");
  const result = await validateTutorial(tutorialRoot);

  if (result.errors.length) {
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`教程检查通过：${result.checkedFiles} 个 Markdown 文件，0 个错误。`);
  }
}
