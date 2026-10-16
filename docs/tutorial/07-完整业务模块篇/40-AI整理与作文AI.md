---
title: "第 40 章：AI 整理与作文 AI"
chapter: 40
stage: "完整业务模块篇"
status: "可学习"
estimated_minutes: 320
prerequisites: [39]
last_verified: "2026-10-15"
project_version: "0.6.0"
knowledge_type: "项目当前实现 + 通用知识"
---
# 第 40 章：AI 整理与作文 AI

## 本章目标

理解 AI 在学习空间中的正确位置：整理已有资料、识别图片、辅助作文复盘；学会配置提供商、保护密钥、验证结构化输出、人工确认和安全重试。

## 开始前需要会什么

理解异步请求、服务接口、附件、草稿、版本冲突和错误分类。

## 新术语表

| 术语 | 含义 |
|---|---|
| Provider | 实际提供模型 API 的服务 |
| Endpoint | 请求发送到的 API 地址 |
| API key | 证明调用权限的秘密凭据 |
| Structured output | 按预定字段返回的数据 |
| Prompt injection | 资料中的文字试图改变系统规则 |
| Human in the loop | AI 结果必须由用户确认 |
| Idempotency | 重试不会产生重复正式记录 |

## 先建立直觉

AI 不是数据库，也不应替用户决定最终资料。它像整理助理：读取用户明确选择的内容，给出分类、摘要或作文建议；原始资料不变，建议可撤销，用户确认后才保存。

## 图解

~~~mermaid
flowchart TD
  A[用户选择资料/作文附件] --> B[前端服务]
  B --> C[Rust command]
  C --> D[读取安全设置与密钥]
  D --> E[模型 Provider]
  E --> F[解析并验证结构化结果]
  F --> G[预览]
  G -->|确认| H[保存 AI 复盘]
  G -->|拒绝| I[保留原资料]
  F -->|失败| J[可解释错误与安全重试]
~~~

## 跟我一步一步做

1. 阅读 [ai.types.ts](../../../src/services/ai/ai.types.ts)，区分 SafeAiSettings、连接测试、图片识别和 EssayAiReview。
2. SafeAiSettings 只返回 hasApiKey，永远不把真实 key 回传界面。
3. 从 [ai.service.ts](../../../src/services/ai/ai.service.ts) 了解前端能力，再对照 [tauri-ai.service.ts](../../../src/services/ai/tauri-ai.service.ts) 的 command 映射。
4. 进入 [ai_commands.rs](../../../src-tauri/src/commands/ai_commands.rs)，确认命令只校验输入并委托数据/Provider 层。
5. 在 [provider.rs](../../../src-tauri/src/data/ai/provider.rs) 查看网络边界、超时、状态码和响应解析。
6. 作文 AI 输入必须绑定 attemptId 和 confirmedAttachmentIds；没有用户确认的附件不发送。
7. 返回结果分别保存评分依据、语法问题、措辞问题、内容分析、句子建议、优化稿和表达积累，不把一整段无法验证的文字当唯一结果。
8. review 先预览；confirmReview 携带 version，防止旧结果覆盖新确认。
9. retryReview 关联原 requestId，界面明确显示“重试产生的新版本”，避免重复扣费和重复记录。
10. 资料整理 AI 第一版优先做：建议标题、学科、类型、标签、摘要和重复项；每项都可单独接受或拒绝。

## 完整示例

一次作文复盘：用户选择已保存的作文尝试和两张确认附件 → Rust 读取附件并调用模型 → 验证 JSON 字段与长度 → 创建未确认 review → 页面并排展示原文、问题和建议 → 用户修改或确认 → 版本化保存。原作文、原图与识别文字始终保留。

资料整理结果可以设计为：

~~~ts
type OrganizeSuggestion = {
  sourceItemId: string;
  suggestedTitle: string;
  suggestedSubject: string;
  suggestedKind: string;
  suggestedTags: string[];
  summary: string;
  possibleDuplicateIds: string[];
};
~~~

## 逐段解释

密钥必须由 Rust 安全存储，诊断日志只能说明“是否存在”，不能打印值。上传资料前显示范围和用途。把附件中的文字当数据，不当系统指令；模型输出先反序列化、长度限制和枚举校验，再进入预览。AI 错误分网络、鉴权、额度、格式和业务冲突，用户才知道下一步。

## 运行并观察

先使用浏览器假服务运行 [AI 服务测试](../../../src/services/ai/ai.service.test.ts)，观察成功、失败与重试。配置真实 Provider 时先做连接测试，再使用不含隐私的练习作文。确认日志、错误信息和导出诊断中都没有 API key 或完整敏感正文。

## 常见错误与修复

- key 放 localStorage 或前端源码：移到 Rust 安全凭据层。
- AI 结果直接覆盖资料：先生成未确认建议。
- 把整库默认发送：只发送用户明确选择的最小范围。
- 相信模型返回 JSON：仍要解析、字段和长度校验。
- 错误统一显示“失败”：区分鉴权、网络、额度、格式和冲突。
- 自动无限重试：限制次数、保留 requestId，并提示可能产生费用。
- 把识别和评价混为一步：保留 recognizedText，让用户知道模型评的是哪份文字。

## 在“学习空间”项目里找到它

从 [AI 类型](../../../src/services/ai/ai.types.ts)、[Tauri AI 服务](../../../src/services/ai/tauri-ai.service.ts)、[AI commands](../../../src-tauri/src/commands/ai_commands.rs)、[Provider](../../../src-tauri/src/data/ai/provider.rs)、[安全设置](../../../src-tauri/src/data/ai/settings.rs)、[凭据](../../../src-tauri/src/data/ai/credentials.rs) 和 [作文 AI 识别](../../../src-tauri/src/data/ai/essay_recognition.rs) 逐层阅读。

## 必做练习

画出一次 AI 请求的信任边界；列出绝不能进入日志的字段；为五类错误写用户提示；设计资料整理建议的逐项确认界面；说明 prompt injection 为什么也适用于自己的笔记。

## 选做挑战

实现离线“规则整理器”作为无 AI 降级方案：根据文件名、已有学科、日期和关键词建议分类。让它与在线 AI 实现同一接口，并用测试证明切换 Provider 不修改页面。

## 答案与思路

信任边界包含前端、Rust、本地文件和外部 Provider；秘密、完整敏感正文和认证头不能记录；错误提示必须告诉用户是否可重试；每个建议带复选框和变更预览；任何文本都可能包含“忽略规则”等内容，因此只能作为引用数据。

## 本章自检

- [ ] AI 在本应用中的主要职责是什么？
- [ ] API key 为什么不能返回前端？
- [ ] 什么内容发送前必须确认？
- [ ] 结构化输出为何仍要校验？
- [ ] recognizedText 为什么要保留？
- [ ] 重试怎样避免重复记录？
- [ ] 如何提供无 AI 降级方案？

## 本章小结

你已经掌握一个可信 AI 功能的完整边界：最小输入、安全密钥、结构化校验、可解释错误、人工确认、版本化保存和可替换 Provider。AI 成为资料整理与作文复盘助手，而不是不可控的自动改写器。

## 下一章

下一章将学习第 41 章“设备互联与加密快照”。在继续之前，请先完成本章信任边界图和密钥泄漏检查表。
