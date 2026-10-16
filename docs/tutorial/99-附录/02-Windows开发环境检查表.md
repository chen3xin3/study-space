---
title: "Windows 开发环境检查表"
status: "可使用"
last_verified: "2026-10-12"
project_version: "0.6.0"
---

# Windows 开发环境检查表

这是一份安装与排错清单。完整原理和操作过程见第 04 章。工具版本会更新，因此这里检查“命令是否存在、输出格式是否合理、是否满足项目配置”，不声称某个数字永远是最新版。

> [!warning] 只从官方来源安装
> 不使用写着“绿色破解版”“高速下载器”或要求关闭安全软件的重新打包程序。下载页变化时，优先核对官方域名、发布者名称与数字签名。

## 开始检查前

- [ ] 使用普通用户打开一个新的 PowerShell 窗口；
- [ ] 知道命令只是检查版本，不会修改项目；
- [ ] 运行 `Get-Location`，确认当前目录；
- [ ] 不在管理员终端中盲目执行复制来的脚本。

## VS Code

用途：编辑与搜索代码、显示问题、打开集成终端。

```powershell
code --version
```

正常现象：第一行是类似 `1.xx.x` 的版本号，后面可能还有提交标识和架构。

```powershell
Get-Command code
```

正常现象：显示 `code` 对应的命令位置。

- [ ] 可以从开始菜单打开 VS Code；
- [ ] `code --version` 能输出版本；
- [ ] 可以用“文件 → 打开文件夹”打开练习目录；
- [ ] 集成终端可以选择 PowerShell。

若开始菜单能打开但命令无法识别，通常是命令没有加入 PATH。先关闭所有终端并重新打开；仍无效时通过 VS Code 安装程序的 PATH 选项修复，而不是随便移动程序文件。

## Node.js 与 npm

用途：运行 Vite、TypeScript 工具、前端测试和教程验证脚本。

```powershell
node --version
npm --version
Get-Command node
Get-Command npm
```

正常现象：`node` 常以 `v` 开头显示版本，`npm` 显示数字版本，两条 `Get-Command` 都能找到路径。

- [ ] 安装的是官方支持的长期维护版本或项目明确支持的版本；
- [ ] Node 与 npm 都能在新终端中运行；
- [ ] 没有把网页上的 JavaScript 运行环境和 Node.js 混为一谈。

若 Node 可以运行而 npm 被 PowerShell 执行策略拦截，先完整记录错误。不要直接把全系统执行策略改为最宽松；优先检查官方安装是否完整、当前调用的是 `.cmd` 还是脚本，以及组织设备的安全策略。

## Git for Windows

用途：查看差异、保护历史、选择性提交文件。

```powershell
git --version
Get-Command git
```

正常现象：输出类似 `git version 2.x.x.windows.x`，并能找到 `git.exe`。

- [ ] Git 命令可用；
- [ ] 知道用户名和邮箱只影响提交作者信息；
- [ ] 不会为了“清爽”而删除项目中的 `.git`；
- [ ] 第一次练习在独立练习仓库完成。

## Rust 与 Cargo

用途：编译 Tauri 后端、本地数据层与平台能力。

```powershell
rustc --version
cargo --version
rustup show
```

正常现象：`rustc` 和 `cargo` 都显示版本，`rustup show` 能列出已安装工具链与默认 host。

- [ ] `rustc` 可用；
- [ ] `cargo` 可用；
- [ ] Rust 工具链架构适合当前 Windows；
- [ ] 重新打开终端后命令仍可用。

若刚安装后无法识别，先重开终端。Rustup 通常把命令放在当前用户目录并更新 PATH，旧终端不会自动获得新的环境。

## Microsoft C++ Build Tools

用途：为 Windows 上的 Rust/Tauri 依赖提供链接器、Windows SDK 和本机编译工具。

检查方式不是只找一个版本命令，而是打开 Visual Studio Installer，确认已安装面向桌面的 C++ 工作负载，并包含：

- MSVC 构建工具；
- 与当前系统兼容的 Windows SDK；
- CMake 工具（依赖需要时）。

- [ ] Visual Studio Installer 中能看到已安装的 Build Tools；
- [ ] Rust 项目构建时不再报告找不到 `link.exe`；
- [ ] 没有因为只安装 VS Code 就误以为 C++ 工具也已经存在。

## Microsoft Edge WebView2

用途：在 Windows Tauri 应用中显示 React Web 界面。

现代 Windows 通常已经安装 WebView2 Runtime。若 Tauri 窗口空白或运行时明确报告 WebView2 缺失，再从 Microsoft 官方渠道安装 Evergreen Runtime。

- [ ] 系统应用列表或官方检测工具能确认 WebView2 Runtime；
- [ ] 不把 Edge 浏览器图标是否存在当作唯一判断；
- [ ] Tauri 窗口可以显示基础页面。

## 项目级检查

这些命令在 `D:\Projects\study-space` 运行前，先查看状态：

```powershell
Set-Location -LiteralPath "D:\Projects\study-space"
git status --short
```

`git status --short` 只查看状态。若显示很多已有修改，不要清理或覆盖。

依赖已经安装时，可检查：

```powershell
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

这些检查可能需要较长时间。测试失败要记录具体测试名和第一条有意义的错误，不要只记录“没通过”。

## Android 工具链：后续需要

完成第 01～06 章暂时不需要安装下面这些工具。它们会在 Android 构建课程中逐项配置：

- Android Studio；
- 受项目支持的 JDK；
- Android SDK Platform 与 Build Tools；
- Android NDK；
- Gradle（通常由项目 wrapper 管理）；
- `adb` 与 USB 调试；
- Android 签名密钥。

现在只需要知道：Android 构建不是把 Windows `.exe` 改后缀成 `.apk`，它需要独立工具链、平台配置、权限和真机验证。

## 常见诊断顺序

当命令提示“无法将名称识别为 cmdlet、函数、脚本文件或可运行程序”时：

1. 核对命令拼写；
2. 关闭终端并新开一个；
3. 用 `Get-Command 工具名` 检查；
4. 从开始菜单确认软件是否真的安装；
5. 检查官方安装程序中的 PATH 选项；
6. 记录完整错误和安装来源；
7. 不要从不明网站下载同名 `.exe` 塞进系统目录。

当命令存在但项目构建失败时：

1. 记录当前目录；
2. 记录工具版本；
3. 找到第一条真正的 error，而不是最后一句“构建失败”；
4. 判断是依赖下载、权限、编译、测试还是文件路径问题；
5. 先运行更小范围的验证；
6. 参照项目锁文件和官方文档核对版本。

返回[课程总目录](../00-课程总目录.md)。
