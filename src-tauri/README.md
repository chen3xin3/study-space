# Tauri 后端目录

- `src/`：Rust 应用代码。数据模型、SQLite、备份、附件和 Tauri commands 都在这里。
- `Cargo.toml`、`Cargo.lock`：Rust 依赖和锁定版本。
- `tauri.conf.json`：Windows/桌面 Tauri 配置。
- `tauri.android.conf.json`：Android 覆盖配置，包含 `versionCode` 和最低 SDK。
- `capabilities/`：Tauri 权限声明。
- `icons/`、`app-icon.svg`：应用图标。
- `gen/`：Tauri 自动生成的 Android 工程，不要把它当作主要源码目录。
- `target/`：Rust 编译缓存，可删除后自动重建。

修改 Rust 业务时优先看 `src/`；修改 Android 打包版本时看 `tauri.android.conf.json`，不要直接编辑 `gen/android` 中的自动生成文件。

