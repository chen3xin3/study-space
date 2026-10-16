---
title: "第 15 章：npm、依赖与 Vite"
chapter: 15
stage: "TypeScript、Vite 与 React篇"
status: "可学习"
estimated_minutes: 160
prerequisites: [13, 14]
last_verified: "2026-10-14"
project_version: "0.6.0"
knowledge_type: "通用知识 + 项目当前实现"
---

# 第 15 章：npm、依赖与 Vite

## 本章目标

学完后，你能够：

1. 区分 Node.js、npm、TypeScript 和 Vite；
2. 看懂 package.json 中名称、版本、脚本和依赖；
3. 解释 package-lock.json 为什么要保留；
4. 区分 dependencies 与 devDependencies；
5. 知道 node_modules、dist 和源码的关系；
6. 启动 React 教学实验；
7. 运行类型检查、测试和生产构建；
8. 根据错误判断工作目录、端口、依赖或代码问题。

## 开始前需要会什么

- 会在 PowerShell 确认当前目录；
- 能运行 npm 命令；
- 已完成第 13、14 章；
- 知道浏览器最终执行 JavaScript；
- 本章不要求安装新依赖。

## 新术语表

| 术语 | 普通话解释 |
| --- | --- |
| Node.js | 在浏览器外运行 JavaScript 的环境 |
| npm | 管理包并执行项目脚本的工具 |
| package | 可复用的代码或工具包 |
| dependency | 项目依赖的外部包 |
| manifest | 描述项目配置与依赖的清单文件 |
| lockfile | 锁定实际解析依赖版本的文件 |
| script | package.json 中命名的命令 |
| Vite | 开发服务器与前端构建工具 |
| 开发服务器 | 开发时向浏览器提供源码与转换结果的本地服务 |
| 热更新 | 保存后尽量只更新变化模块 |
| 构建 | 检查、转换和组织可发布资源 |
| node_modules | npm 安装依赖的本地目录 |
| dist | 常见的构建输出目录 |
| 端口 | 本机服务监听的数字入口 |

## 先建立直觉

可以把项目想成厨房：

- package.json 是菜单与工具清单；
- package-lock.json 记录每一种材料的确切批次；
- npm 根据清单准备依赖并执行流程；
- node_modules 是材料仓库；
- TypeScript 检查配方中的类型矛盾；
- Vite 在开发时快速出餐，在发布时整理成成品；
- 浏览器是最终品尝页面的环境。

类比只是帮助分工。真实工具通过文件、进程和网络端口协作。

## 图解

~~~mermaid
flowchart LR
    P[package.json scripts] --> N[npm]
    N --> T[TypeScript 检查]
    N --> V[Vite 开发或构建]
    V --> B[浏览器资源]
    L[package-lock.json] --> N
    M[node_modules] --> T
    M --> V
~~~

开发与生产：

| 开发 | 生产构建 |
| --- | --- |
| 本地服务器持续运行 | 命令执行后结束 |
| 保存后快速更新 | 生成优化后的静态资源 |
| 便于调试 | 面向打包和发布 |
| 不等于安装版应用 | 仍只是 Tauri 打包的一部分 |

## 跟我一步一步做

### 第一步：确认目录

    Get-Location

预期位于 D:\Projects\study-space。若不是，先安全切换。npm 会从当前目录寻找 package.json。

### 第二步：查看可用脚本

    npm run

真实项目目前提供 dev、build、test、test:run、check 和 tauri。脚本是项目约定入口，比记住底层长命令更可靠。

### 第三步：启动独立实验

    npm exec vite -- docs/tutorial/labs/react-basics --config docs/tutorial/labs/react-basics/vite.config.ts --port 4175

看到 Local 地址后保持终端运行，用浏览器打开。停止时回到终端按 Ctrl+C。

### 第四步：运行类型检查

另开终端，在项目根目录运行：

    npm exec tsc -- -p docs/tutorial/labs/react-basics/tsconfig.json

无错误时通常不输出正文。

### 第五步：运行聚焦测试

    npm run test:run -- docs/tutorial/labs/react-basics/src/domain/task-operations.test.ts

    npm run test:run -- docs/tutorial/labs/react-basics/src/services/in-memory-task-service.test.ts

聚焦测试适合学习和开发反馈；最终仍需完整测试。

### 第六步：理解真实构建

    npm run build

package.json 定义它先执行 tsc -b，再执行 vite build。前一步类型检查，后一步生成前端资源。它不会自动生成完整 Windows 安装包。

## 完整示例

查看真实清单：[package.json](../../../package.json)。

核心结构可读作：

    {
      "scripts": {
        "dev": "vite --port 1420",
        "build": "tsc -b && vite build",
        "test:run": "vitest run"
      }
    }

左边是项目使用的短名称，右边是 npm 实际启动的工具命令。

教学实验另外使用：

- [实验 Vite 配置](../labs/react-basics/vite.config.ts)
- [实验 TypeScript 配置](../labs/react-basics/tsconfig.json)
- [实验 HTML](../labs/react-basics/index.html)

它们隔离于生产源码，但复用已经安装的工具包。

## 逐段解释

### Node.js 不等于浏览器

两者都运行 JavaScript，但提供的环境 API 不同。document 属于浏览器；文件系统等 Node 能力不能直接假设在网页存在。

### npm 不只是下载工具

npm 也读取脚本、解析版本、启动 TypeScript、Vite 和 Vitest。npm exec 用于运行项目依赖提供的命令。

### package.json 与 lockfile

package.json 描述允许版本范围和直接依赖；lockfile 记录完整解析结果。团队提交 lockfile，减少不同电脑得到不同依赖组合。

### dependencies 与 devDependencies

应用运行或打包直接依赖的库通常在 dependencies；只在开发、检查和测试使用的工具通常在 devDependencies。分类不是安全边界，也不是“一个重要、一个不重要”。

### node_modules 为什么不手改

它由包管理器生成，重新安装会覆盖。需要修复依赖时升级版本、配置工具或向上游提交，而不是改生成目录。

### dist 为什么不手改

dist 是构建输出。真正修改应回到源码，重新构建。直接修改产物无法稳定复现。

### Vite 做了什么

开发时提供模块、转换 TSX、处理 CSS 和资源，并支持快速更新；构建时分析入口、转换和优化资源。

## 运行并观察

### 观察热更新

保持开发服务器运行，修改实验页一段文字并保存。浏览器更新后再恢复原文。观察页面通常无需完整手动刷新。

### 观察端口

端口 4175 被占用时，Vite 可能选择其他端口或报错。始终以终端实际输出地址为准。

### 观察错误层次

- PowerShell 找不到 npm：环境或 PATH；
- 找不到 package.json：目录错误；
- 无法解析包：依赖或导入错误；
- TypeScript 报类型：源码契约错误；
- 浏览器 Console 红字：运行时问题；
- Network 请求 404：路径或服务问题。

### 观察构建产物

构建前后查看 Git 状态。dist 等生成目录不应被当作手写源码提交，除非项目发布流程明确要求。

## 常见错误与修复

### 在错误目录运行 npm

先 Get-Location，再确认当前目录存在 package.json。

### 看到 npm install 就随便执行

当前项目依赖已经存在。本章不要求安装，避免无意修改锁文件。

### 开发服务器退出后页面打不开

终端进程必须保持运行。重新启动并使用最新地址。

### 端口被占用

停止旧服务器，或选择明确的新端口。不要同时留下多个不认识的进程。

### 修改 node_modules 后暂时有效

修改会被安装覆盖。回到项目源码或配置解决。

### 把 npm run build 当成 Windows 安装包

它只完成前端生产构建。Tauri 打包将在后续章节学习。

### 只看最后一行错误

保留完整命令和首次关键错误。后面的连锁错误常由最早问题造成。

## 在“学习空间”项目里找到它

重点文件：

- [package.json](../../../package.json)
- [根 TypeScript 配置](../../../tsconfig.json)
- [Vite 配置](../../../vite.config.ts)
- [前端入口](../../../src/main.tsx)
- [应用路由入口](../../../src/app/App.tsx)

阅读顺序：清单脚本 → 配置 → HTML 入口 → main.tsx → App.tsx。不要从随机巨大页面开始。

## 必做练习

### 练习一

用一句话分别解释 Node.js、npm、TypeScript 和 Vite。

### 练习二

从 package.json 找出 React、Vite、Vitest 和 Tauri CLI 分别位于哪类依赖。

### 练习三

解释 package-lock.json 与 node_modules 为什么一个应提交、一个通常不提交。

### 练习四

启动实验页、完成一次文字热更新、恢复原文并停止服务器。

### 练习五

为“页面打不开”写出按顺序的五项检查，不允许第一步就重装全部工具。

## 选做挑战

使用 npm run 查看脚本，再根据 package.json 手工解释 check 脚本的执行顺序。只解释，不修改脚本。

## 答案与思路

### 练习一

Node.js 提供浏览器外 JavaScript 环境；npm 管理包并执行脚本；TypeScript进行类型检查；Vite提供开发服务器与生产构建。

### 练习二

React 属于 dependencies；Vite、Vitest 和 Tauri CLI 当前属于 devDependencies。以实际清单为准。

### 练习三

lockfile 是可复现安装清单；node_modules 是体积很大的生成目录，可由清单重新生成。

### 练习四

证据包括终端 Local 地址、浏览器标题、保存后变化、恢复后的内容，以及 Ctrl+C 后服务器停止。

### 练习五

检查目录、服务器进程、终端实际地址、浏览器 Console、Network；再检查导入和依赖，不先盲目重装。

## 本章自检

- [ ] 我能区分 Node.js、npm、TypeScript、Vite；
- [ ] 我会阅读 package.json 脚本；
- [ ] 我知道 lockfile 的作用；
- [ ] 我不会手改 node_modules 和 dist；
- [ ] 我能启动并停止实验服务器；
- [ ] 我能运行类型检查和聚焦测试；
- [ ] 我知道前端构建不等于 Tauri 安装包；
- [ ] 我能按层次排查启动失败。

## 本章小结

npm 根据项目清单管理依赖并启动工具；TypeScript 在运行前检查类型；Vite 在开发时提供快速服务器，在构建时生成浏览器资源。明确每个工具的职责，能避免把目录、端口、类型和运行时问题混为一谈。

## 下一章

下一章进入 React：从普通函数理解组件，从 HTML 对比 JSX，再用 props 把带类型的任务传给任务列表。

继续：[第 16 章：React 组件与 JSX](16-React组件与JSX.md)
