---
title: "PowerShell 命令速查"
status: "可使用"
last_verified: "2026-10-12"
project_version: "0.6.0"
---

# PowerShell 命令速查

下面的写入示例只在专用练习目录中使用。第一次操作前先确认路径，不在真实项目、应用数据目录或个人重要文件夹中练习。

```powershell
New-Item -ItemType Directory -Path "D:\Desktop\study-space-course-practice"
Set-Location -LiteralPath "D:\Desktop\study-space-course-practice"
Get-Location
```

如果目录已存在，`New-Item` 会报告冲突。这不代表电脑坏了，请换一个明确的新名称，例如 `study-space-course-practice-2`，并在后续命令中保持一致。

## 先看懂一条命令

```powershell
Get-ChildItem -LiteralPath "D:\Desktop\study-space-course-practice"
```

- `Get-ChildItem`：命令名称，意思是列出某个位置内的项目；
- `-LiteralPath`：参数名称，表示后面的路径按字面理解；
- 引号中的文字：参数值，也就是要查看的路径；
- 空格：分隔命令和参数，不是随意装饰；
- 按 Enter：才会真正执行。

## `Get-Location`：查看当前位置

```powershell
Get-Location
```

预期：输出 `Path` 和当前目录。它不修改文件。

常见错误：看到提示符里已有路径就猜当前位置。正确做法是运行命令取得证据。

## `Get-ChildItem`：列出内容

```powershell
Get-ChildItem
Get-ChildItem -LiteralPath ".\notes"
Get-ChildItem -Force
```

- 不带路径：列出当前目录；
- `-LiteralPath`：列出指定位置；
- `-Force`：也显示通常隐藏的项目，只是显示，不是强制删除。

常见错误：把输出列表当成文件内容。它显示的是名称、类型、时间和大小等信息。

## `Set-Location`：切换当前目录

```powershell
Set-Location -LiteralPath "D:\Desktop\study-space-course-practice"
Set-Location -LiteralPath ".\notes"
Set-Location -LiteralPath ".."
```

- 第一条使用绝对路径；
- 第二条从当前目录进入 `notes`；
- `..` 表示上一级目录。

执行后立刻用 `Get-Location` 验证。路径不存在时会报错，当前位置通常保持不变。

## `New-Item`：创建练习文件或目录

只在练习目录中使用：

```powershell
New-Item -ItemType Directory -Path ".\notes"
New-Item -ItemType File -Path ".\notes\first-note.txt"
```

预期：出现目录和空文本文件。若同名项目已存在，PowerShell 默认不会默默覆盖。

常见错误：忘记 `-ItemType`，或者在错误目录中创建。执行前后都用 `Get-Location` 与 `Get-ChildItem` 核对。

## `Get-Content`：读取文本

```powershell
Get-Content -LiteralPath ".\notes\first-note.txt"
```

空文件不会显示正文，这是正常结果。它不表示命令没运行。

常见错误：用它读取图片、数据库或可执行文件。`Get-Content` 适合文本，不是通用文件查看器。

## `Copy-Item`：复制明确目标

```powershell
Copy-Item -LiteralPath ".\notes\first-note.txt" -Destination ".\notes\first-note-copy.txt"
Get-ChildItem -LiteralPath ".\notes"
```

预期：原文件仍在，同时出现副本。

常见错误：把复制和移动混淆，或目标名称已经存在。练习时不用 `-Force`，让冲突明确显示出来。

## `Move-Item`：移动或重命名

```powershell
Move-Item -LiteralPath ".\notes\first-note-copy.txt" -Destination ".\notes\renamed-note.txt"
Get-ChildItem -LiteralPath ".\notes"
```

预期：旧名称消失，新名称出现，文件内容不变。

常见错误：目标目录写错后找不到文件。先查看源目录和目标目录，再执行移动。

## `Select-String`：在文本中搜索

```powershell
Select-String -LiteralPath ".\notes\first-note.txt" -Pattern "学习"
```

预期：有匹配时显示文件、行号和文字；没有匹配时通常不输出。没有输出不是程序卡死。

在真实项目里搜索源码时优先使用项目已有的 `rg` 工具（若可用），但先学会 `Select-String` 有助于理解“搜索内容”和“搜索文件名”的区别。

## `Get-Command`：确认命令来自哪里

```powershell
Get-Command node
Get-Command git
Get-Command Get-ChildItem
```

预期：显示命令类型、名称和来源。它适合判断工具是否加入 PATH，或你实际调用的是哪个同名程序。

## `$LASTEXITCODE`：查看本机程序退出码

```powershell
git --version
$LASTEXITCODE
```

通常 `0` 表示命令成功完成，非零表示程序报告失败。具体数字含义由程序定义。

注意：PowerShell 自己的 cmdlet 不总是通过 `$LASTEXITCODE` 表示状态，因此不能在所有命令后机械套用它。

## `Ctrl+C`：停止当前前台任务

开发服务器持续运行时，终端不会立刻返回提示符。按住 `Ctrl` 再按 `C` 通常可以请求停止当前任务。

不要把 `Ctrl+C` 和关闭整个窗口混淆；前者主要是向当前前台程序发送中断。

## 引号、空格与精确路径

路径里有空格或中文时始终使用引号：

```powershell
Get-ChildItem -LiteralPath "D:\My Study Files"
```

`-LiteralPath` 不把 `[`、`]`、`*`、`?` 等字符当作通配模式，适合处理你已经明确知道的精确路径。

## 常见输出应该怎样理解

| 现象 | 可能含义 | 下一步证据 |
| --- | --- | --- |
| 没有任何输出 | 可能成功但没有内容或匹配 | 用 `Get-ChildItem` 或检查文件验证 |
| “找不到路径” | 路径拼写、起点或文件不存在 | `Get-Location`，再逐级列目录 |
| “无法识别命令” | 拼写错误或工具不在 PATH | `Get-Command`，确认安装并重开终端 |
| “访问被拒绝” | 当前用户没有权限或文件被占用 | 确认目标，不要立即改管理员权限 |
| 提示项目已存在 | 同名文件或目录已经存在 | 列目录，决定使用新名称还是停止 |

## 按 Enter 前的安全清单

- [ ] 我能说出命令要做什么；
- [ ] 我用 `Get-Location` 确认了当前目录；
- [ ] 我核对了所有绝对路径；
- [ ] 操作目标是练习文件，不是真实项目数据；
- [ ] 命令不包含我不理解的通配符、管道或重定向；
- [ ] 命令不要求删除、清空、覆盖或管理员权限；
- [ ] 如果命令来自网页，我已在官方文档中核对。

## 本阶段不练习的操作

本附录故意不提供递归删除、磁盘格式化、注册表修改、全局权限放宽和系统目录移动示例。这些操作不是学习基础命令所必需的，而且目标判断错误可能造成不可恢复的损失。

返回[课程总目录](../00-课程总目录.md)。
