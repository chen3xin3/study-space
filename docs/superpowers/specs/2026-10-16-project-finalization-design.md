# 项目收尾与目录重组设计

## 目标

将当前同时存在旧工作目录与 `开源` 副本的状态，整理为一个可持续维护的正式项目：`D:\Desktop\app`。在保留真实源码、教程、最新安装包和可恢复历史的前提下，删除可再生成内容、旧发布包和重复副本，显著降低磁盘占用与后续维护风险。

## 当前状态

- 根目录 `D:\Desktop\app` 是旧工作仓库，包含 231 项未提交状态，其中有大量文档迁移、源码修改与新增文件。
- `D:\Desktop\app\开源` 是已经验证并上传 GitHub 的干净仓库，`main` 与 `origin/main` 一致。
- 两套项目的 React 源码完全一致；开源副本还包含公开仓库所需的许可证、贡献指南、CI 配置和经过清理的教程。
- 当前磁盘占用主要来自可再生成内容：
  - `src-tauri\target` 约 51.1GB；
  - `src-tauri\gen\android` 约 1.27GB；
  - `.android-tools` 约 3.36GB；
  - `.visual-qa` 约 796MB；
  - `node_modules` 约 167MB；
  - `release` 约 1.19GB，其中大部分是旧版和实验安装包。

## 方案选择

采用“唯一主项目”方案：以已上传 GitHub、测试通过的 `开源` 仓库作为最终版本，将其提升到 `D:\Desktop\app` 根目录。旧仓库中不可再生成的内容先制作恢复备份，然后移除旧 Git 元数据、重复源码和历史输出。

不采用以下方案：

- 仅删除缓存：无法解决两套源码并存和容易改错目录的问题。
- 继续使用旧根仓库：旧仓库状态复杂，清理和重新发布风险高于使用已验证的干净仓库。

## 最终目录结构

```text
D:\Desktop\app
├─ .git                 GitHub 版本记录
├─ .github              CI、Issue 与 PR 配置
├─ docs
│  ├─ tutorial          49 章学习教程
│  ├─ maintainers       维护文档
│  └─ superpowers       设计与实施记录
├─ scripts              项目维护脚本
├─ src                  React + TypeScript 前端
├─ src-tauri            Tauri + Rust 后端
├─ release
│  └─ current           最新桌面端与 Android 安装包
├─ package.json
├─ README.md
└─ LICENSE
```

## 保留内容

- `开源` 仓库中的全部受版本控制文件与 Git 提交记录；
- 当前全部前端、Rust 后端、Tauri 配置和测试；
- 49 章教程及维护者文档；
- GitHub Actions、Issue 模板、贡献指南、安全说明和 MIT 许可证；
- 最新发布文件：
  - `学习空间_0.6.0_安装版.exe`；
  - `学习空间_0.6.0_免安装版.exe`；
  - `学习空间_0.6.0_平板版.apk`；
- 一份放在项目目录之外的旧仓库恢复备份，用于必要时找回旧历史或遗漏内容。

## 删除内容

- Rust/Tauri 编译缓存：`src-tauri\target`；
- 自动生成 Android 工程：`src-tauri\gen\android`；
- 项目内下载的 Android/JDK/Gradle 工具副本：`.android-tools`；
- 浏览器视觉检查缓存与临时截图：`.visual-qa`；
- 可重新安装或构建的 `node_modules`、`dist`；
- `release\archive`、`release\experiments` 和旧名称的当前安装包；
- 临时 `artifacts`、日志和旧工作流程目录；
- 根目录和 `开源` 之间的重复源码与文档；
- 完成提升后不再保留 `开源` 这一层目录。

## 安全迁移流程

1. 再次验证旧根目录和 `开源` 仓库状态，并生成保留/删除清单。
2. 在 `D:\Desktop` 下创建带日期的旧项目恢复备份，只包含不可再生成内容和旧 Git 历史，不收录 50GB 编译缓存。
3. 校验备份能够列出且包含旧 `.git`、源码、配置和文档。
4. 删除已确认可再生成的大目录与旧发布文件。
5. 将 `开源` 仓库内容（包含其 `.git`）提升到 `D:\Desktop\app` 根目录。
6. 将三个最新安装包放入新的 `release\current`，并写明其用途。
7. 删除空目录、重复副本和迁移暂存内容。
8. 检查最终目录树、Git 远程、分支、状态和忽略规则。

任何递归删除或移动之前，都必须解析并核对目标绝对路径属于 `D:\Desktop\app` 中已列明的目录；不得使用未解析变量、通配符或跨 Shell 拼接删除目标。

## 后续维护设计

- `D:\Desktop\app` 是唯一允许修改和提交的项目目录。
- GitHub `main` 是正式远程分支；日常修改在功能分支完成，测试通过后再合并。
- 增加维护脚本，默认只显示将被清理的内容；必须显式确认后才删除生成目录。
- README 增加“日常开发”“重新生成 Android 工程”“构建发布包”“清理空间”和“上传 GitHub”说明。
- 发布目录只保留当前版本；历史发布由 GitHub Releases 保存，不继续堆积在源码目录。
- 本地数据库、照片、附件和密钥继续保存在应用数据目录，不加入 Git。

## 验证标准

- 根目录只剩一套项目，不再存在 `D:\Desktop\app\开源`；
- `git remote -v` 指向 `https://github.com/chengxin23333-hue/study-space.git`；
- `git status --short` 干净；
- 受版本控制文件数量与迁移前开源仓库一致或仅包含明确新增的维护文件；
- 不存在受版本控制的 `node_modules`、`dist`、`target`、`gen`、`.android-tools`、`.visual-qa` 或发布二进制；
- `npm ci`、`npm run test:run`、`npm run build`、Rust 测试和检查通过；
- Android 工程可按 README 中的命令重新生成；
- 三个最新安装包存在且文件大小与迁移前一致；
- 最终项目体积不包含约 57GB 的可再生成内容。

## 回滚方案

如果迁移后发现文件遗漏，停止提交和构建，从项目目录外的恢复备份中取回所需文件。恢复备份在最终验证完成前不得删除；它不是正式项目的一部分，也不会上传 GitHub。
