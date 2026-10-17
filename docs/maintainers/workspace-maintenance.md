# 工作区维护

## 唯一项目目录

只在 `D:\Desktop\app` 修改、测试和提交代码。不要再在项目内部创建完整副本。

项目源代码、测试和文档由 Git 管理。数据库、照片、附件、API 密钥、编译缓存和本地安装包不应加入 Git。

## 首次准备

```powershell
npm ci
```

`npm ci` 会严格按照 `package-lock.json` 安装依赖。`node_modules` 可以随时重新生成，不需要备份或上传。

## 日常验证

```powershell
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## 清理生成文件

先预览将要清理的目录：

```powershell
npm run clean:check
```

确认后执行：

```powershell
npm run clean:generated
```

清理命令只允许处理项目中的 `node_modules`、`dist`、`coverage`、`.visual-qa`、`src-tauri/target` 和 `src-tauri/gen/android`，不会删除源码、教程、安装包或用户数据。

## 重新生成 Android 工程

Android 自动生成工程不纳入 Git。需要构建 Android 版本时运行：

```powershell
npm ci
npm run tauri android init
npm run tauri android build
```

Android Studio、SDK、NDK、Gradle 和 JDK 应作为开发环境安装，不再复制到项目目录。

## 发布文件

`release/current` 只保留当前 Windows 安装版、Windows 免安装版和 Android 平板版。历史版本应发布到 GitHub Releases，不继续堆积在源码目录。

## 上传 GitHub

完成修改并通过测试后运行：

```powershell
git add -A
git commit -m "说明本次修改"
git push
```

如果当前网络必须使用本机代理：

```powershell
git -c http.proxy=http://127.0.0.1:65532 -c https.proxy=http://127.0.0.1:65532 push
```

推送前用 `git status --short` 检查待提交内容，不要提交数据库、真实学习资料、密钥、生成目录或安装包。

## 恢复旧项目历史

2026 年 10 月 17 日完成单一工作区整理后，旧仓库历史和当时未提交修改保存在：

```text
D:\Desktop\学习空间-旧项目备份-20261016
```

该备份不属于正式项目，也不会上传 GitHub。在确认新工作区长期稳定前不要删除。
