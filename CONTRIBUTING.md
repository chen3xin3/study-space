# 参与贡献

感谢你帮助改进“学习空间”。贡献前请先搜索现有 Issue，确认没有人正在处理同一问题。

## 开发流程

1. Fork 仓库，从 `main` 创建短期分支。
2. 使用 `npm install` 安装前端依赖。
3. 修改行为时先补充或更新测试。
4. 在提交 Pull Request 前运行：

```powershell
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

5. 一个 Pull Request 只解决一类问题，说明动机、实现和验证结果。

## 项目约定

- 不要提交 `node_modules`、`dist`、`target`、`src-tauri/gen` 或安装包。
- 不要提交真实 API 密钥、`.env` 文件、本地数据库、学习资料或个人诊断报告。
- 不改变数据库结构或公共服务接口，除非 Issue 与 Pull Request 清楚说明迁移和兼容策略。
- 用户界面需同时考虑 Windows 和 Android 平板的触控、滚动和宽高比。
- 提交信息建议使用 `feat:`、`fix:`、`test:`、`docs:`、`refactor:` 或 `chore:` 前缀。

## 报告缺陷

请使用 Bug Report 模板，提供操作系统、应用版本、复现步骤、期望结果和实际结果。安全漏洞请不要创建公开 Issue，请按 [SECURITY.md](SECURITY.md) 处理。

