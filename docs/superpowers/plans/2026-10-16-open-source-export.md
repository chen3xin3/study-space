# 学习空间开源副本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\Desktop\app\开源` 中生成可独立测试、构建和发布到 GitHub 的干净源码仓库。

**Architecture:** 以原工作区当前文件状态为唯一源，定向复制必要的源码、配置、测试和教程，不复制旧 Git 历史或生成产物。在副本内独立补齐开源元数据和 GitHub 配置，所有验证都在副本内执行。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Tauri 2、Rust、Cargo、GitHub Actions。

---

### Task 1: 创建安全的源码快照

**Files:**
- Copy: `../src` -> `src`
- Copy: `../src-tauri` -> `src-tauri`
- Copy: `../docs/tutorial` -> `docs/tutorial`
- Copy: `../index.html`, `../package.json`, `../package-lock.json`, `../tsconfig*.json`, `../vite.config.ts`
- Preserve: `docs/maintainers/2026-10-16-open-source-export-design.md`
- Preserve: `docs/superpowers/plans/2026-10-16-open-source-export.md`

- [x] **Step 1: 记录原项目状态**

Run: `git -C D:\Desktop\app status --short`

Expected: 输出当前未提交修改，仅作为复制前的对照基线。

- [x] **Step 2: 复制白名单内容**

Use PowerShell `Copy-Item -Recurse -Force` 分别复制上述目录和文件，不使用整个项目递归复制。

Expected: 副本包含当前未提交的新文件和修改，但不含父仓库 `.git`。

- [x] **Step 3: 删除复制过程中带入的生成内容**

Remove only these exact paths when present: `src-tauri/target`, `src-tauri/gen`, `docs/tutorial/.obsidian`.

Expected: 副本中不存在构建产物和个人工作区状态。

- [x] **Step 4: 检查复制范围**

Run: `Get-ChildItem -Force D:\Desktop\app\开源`

Expected: 顶层只出现源码、项目配置、公开文档和新仓库 `.git`。

- [x] **Step 5: 提交快照**

Run: `git add src src-tauri docs/tutorial index.html package.json package-lock.json tsconfig.app.json tsconfig.json tsconfig.node.json vite.config.ts && git commit -m "feat: import current study space source"`

Expected: 创建只包含公开源码的第二个提交。

### Task 2: 补齐公开仓库文件

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`
- Replace: `README.md`
- Modify: `package.json`

- [ ] **Step 1: 创建开源 `.gitignore`**

Include dependency/build paths plus `.env`, `.env.*`, `!.env.example`, `*.db`, `*.sqlite*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `.obsidian/`, IDE state, logs and platform-generated directories.

Expected: 本地数据、凭证和可重建产物默认不受 Git 跟踪。

- [ ] **Step 2: 创建 MIT 许可证**

Use copyright line: `Copyright (c) 2026 chengxin23333-hue`.

Expected: GitHub 能自动识别仓库许可证为 MIT。

- [ ] **Step 3: 创建面向普通用户的 README**

Document project positioning, Windows/Android support, main modules, local-first privacy, optional AI configuration, prerequisites, install/run/test/build commands, project layout, tutorial entry, contribution and license.

Expected: 新读者不需要查看历史文档就能理解和运行项目。

- [ ] **Step 4: 创建社区文档**

Write `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and `CHANGELOG.md` with project-specific commands and contact through private GitHub security advisories.

Expected: 贡献、报告漏洞和查看变更都有明确入口。

- [ ] **Step 5: 更新 `package.json` 元数据**

Set description, `license: "MIT"`, repository URL, bugs URL and homepage while preserving `private: true`, scripts, dependencies and version.

Expected: 项目元数据与 GitHub 仓库一致，且不会被误发布到 npm。

- [ ] **Step 6: 运行元数据检查并提交**

Run: `npm pkg get name version private license repository.url bugs.url homepage`

Expected: 显示 0.6.0、`private: true`、MIT 及 `chengxin23333-hue/study-space` 地址。

Run: `git add .gitignore LICENSE README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md package.json package-lock.json && git commit -m "docs: prepare public repository"`

### Task 3: 清理教程中的本机路径

**Files:**
- Modify: `docs/tutorial/**/*.md`

- [ ] **Step 1: 检索不适合公开的路径和名称**

Run: `rg -n "D:\\\\Desktop\\\\app|C:\\\\Users\\\\|19534|AppData|codex-clipboard" docs README.md`

Expected: 列出所有需要改成通用示例的位置，不用搜索结果判定凭证安全。

- [ ] **Step 2: 将教程路径改为通用示例**

Replace project path examples with `D:\Projects\study-space` and explain that readers should substitute their own path.

Expected: 教程命令仍可复制理解，但不暴露原本机目录。

- [ ] **Step 3: 运行教程验证**

Run: `npm run tutorial:check` when the script exists; otherwise run the validator documented by `docs/tutorial/README.md`.

Expected: 55 Markdown files, zero validation errors and all validator tests passing.

- [ ] **Step 4: 提交教程清理**

Run: `git add docs/tutorial && git commit -m "docs: make tutorial paths portable"`

### Task 4: 配置 GitHub 协作与自动检查

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/dependabot.yml`

- [ ] **Step 1: 创建前端 CI**

Configure an Ubuntu job with Node.js 22, `npm ci`, `npm run test:run` and `npm run build`.

Expected: pushes and pull requests to `main` automatically verify the front end.

- [ ] **Step 2: 创建 Rust CI**

Configure a Windows job with stable Rust, Cargo cache, `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

Expected: Tauri backend is checked in an environment aligned with the desktop target.

- [ ] **Step 3: 创建协作模板与 Dependabot**

Provide structured bug/feature forms, a pull request checklist and weekly npm/Cargo dependency update rules.

Expected: issues and pull requests include reproducible information and dependency updates are visible.

- [ ] **Step 4: 检查 YAML 与提交**

Run a local YAML parser when available and inspect every workflow command against `package.json` and `src-tauri/Cargo.toml`.

Run: `git add .github && git commit -m "ci: add public repository checks"`

### Task 5: 安全与体积审计

**Files:**
- Inspect: all tracked files in the open-source repository

- [ ] **Step 1: 检查意外目录和大文件**

Run: `git ls-files` and calculate each tracked file size.

Expected: 不包含 `node_modules`, `dist`, `target`, `release`, `artifacts`, `.visual-qa`, `.android-tools`, `.obsidian` or files larger than 20 MiB.

- [ ] **Step 2: 扫描高风险凭证特征**

Search tracked text for private key headers, cloud access-key formats, bearer tokens, common API-key assignments and real `.env` files. Review every match and distinguish test fixtures from real credentials.

Expected: 零个真实凭证；测试中的假值保留且不能用于真实服务。

- [ ] **Step 3: 检查公开名称和历史品牌**

Run: `rg -n "我的考研空间|my-postgraduate-study-space|19534|AppData" --glob '!package-lock.json' .`

Expected: 用户可见品牌为“学习空间”；包名若保留仅限技术兼容且需在 README 说明。

- [ ] **Step 4: 提交审计修正**

Run: `git add -A && git commit -m "chore: complete public source audit"` only when audit fixes exist.

### Task 6: 安装依赖并完整验证

**Files:**
- Generated but ignored: `node_modules`, `dist`, `src-tauri/target`

- [ ] **Step 1: 验证独立依赖安装**

Run: `npm ci`

Expected: exit code 0 and dependencies installed only inside the open-source copy.

- [ ] **Step 2: 运行全量前端测试**

Run: `npm run test:run`

Expected: all test files and tests pass; if the known dashboard timing test flakes, rerun its file once and document both results rather than hiding the first failure.

- [ ] **Step 3: 运行前端生产构建**

Run: `npm run build`

Expected: exit code 0 and production files generated under ignored `dist`.

- [ ] **Step 4: 运行 Rust 测试和检查**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: both commands exit with code 0; network-only dependency failures are reported separately from source failures.

- [ ] **Step 5: 检查最终 Git 状态**

Run: `git status --short`, `git diff --check`, `git log --oneline --decorate -5`.

Expected: no tracked generated files, no whitespace errors and a small clean public history.

### Task 7: 连接 GitHub 私有仓库

**Files:**
- Modify: `.git/config` through Git commands

- [ ] **Step 1: 配置远程地址**

Run: `git remote add origin https://github.com/chengxin23333-hue/study-space.git`

Expected: `git remote -v` displays the intended repository for fetch and push.

- [ ] **Step 2: 推送前最后确认**

Present repository path, commit list, audit result and verification result to the owner. Pushing is an external write and requires explicit authorization.

- [ ] **Step 3: 推送主分支**

Run after authorization: `git push -u origin main`

Expected: GitHub private repository displays the clean source snapshot and community files.
