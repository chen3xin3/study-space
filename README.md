# 学习空间

“学习空间”是一款面向 Windows 和 Android 平板的本地优先学习管理应用。它把待办、学习日历、专注计时、科目资料、学习照片、复习队列、统计与设备同步放在一个应用中。

> 项目当前处于持续开发阶段。在导入重要资料前，请先使用应用内的备份功能保留副本。

## 主要功能

- 首页：今日待办、学习日历、最近七天趋势和复习提醒。
- 专注学习：任务轨道、计时、休息、中断记录、结束复盘与环境设置。
- 英语资料：保存单词照片、作文、试卷和原始照片档案。
- 数学、政治与专业课：错题、笔记、例题、资料与模拟练习入口。
- 资料库：学习项目、照片、附件、标签、复习队列与 AI 整理建议。
- 本地数据：SQLite 存储、备份、诊断报告和局域网设备同步。

## 技术架构

- 界面：React 19、TypeScript、React Router、Vite。
- 桌面与移动外壳：Tauri 2。
- 本地后端：Rust、SQLite、Serde。
- 测试：Vitest、Testing Library 和 Rust 单元测试。

## 数据与 AI 隐私

核心学习数据保存在用户的本地设备中。AI 是可选功能，用于对用户选择的资料生成分类、标签和整理建议。使用 AI 前需要自行配置兼容的服务地址、模型和 API 密钥。

- 不要将真实密钥写入源码、`.env` 或 Git 提交。
- 桌面端通过系统凭证库保存密钥。
- 发送至第三方 AI 服务的内容受该服务隐私政策约束，请避免提交敏感个人资料。

## 开发环境

建议先安装：

- Node.js 22 与 npm；
- Rust stable 与 Cargo；
- Windows 上构建 Tauri 所需的 WebView2 和 Microsoft C++ Build Tools；
- Android 构建所需的 Android Studio、SDK、NDK 与 JDK 17。

## 快速开始

```powershell
git clone https://github.com/chengxin23333-hue/study-space.git
Set-Location study-space
npm install
npm run dev
```

`npm run dev` 启动浏览器版界面，方便开发界面和前端服务。启动 Windows Tauri 应用：

```powershell
npm run tauri dev
```

## 测试与构建

```powershell
# 全量前端测试
npm run test:run

# TypeScript 检查与前端生产构建
npm run build

# Rust 后端测试与检查
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml

# Windows 安装包
npm run tauri build
```

Android 首次构建前还需要完成 Tauri Android 工程初始化。详细的 Windows 与 Android 环境准备、版本号和打包流程见 [第 45 章：构建、打包与发布](docs/tutorial/08-质量安全与发布篇/45-构建打包与发布.md)。

## 项目目录

```text
study-space/
├─ src/                 React 界面、前端服务与测试
├─ src-tauri/           Rust 后端、Tauri 配置与应用图标
├─ docs/tutorial/       从零开始的完整学习教程
├─ .github/             GitHub 自动测试与协作模板
├─ package.json         前端依赖和命令
└─ vite.config.ts       Vite 与 Vitest 配置
```

## 从零学习这个项目

仓库包含 49 章中文教程，从“软件和源码是什么”开始，逐步进入 React、TypeScript、Tauri、Rust、SQLite、测试和发布。

- [教程总目录](docs/tutorial/00-课程总目录.md)
- [学习方法与进度表](docs/tutorial/00-学习方法与进度表.md)

## 参与贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。提交问题时请附上平台、复现步骤和必要日志，但不要公开 API 密钥、学习资料或诊断报告中的私密信息。

## 许可证

本项目以 [MIT License](LICENSE) 开源。

