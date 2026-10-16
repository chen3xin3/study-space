const MESSAGES: Record<string, string> = {
  VOCABULARY_IMPORT_INVALID: "照片录入内容不完整或格式不正确。",
  VOCABULARY_IMPORT_NOT_FOUND: "没有找到这次照片录入记录。",
  VOCABULARY_IMPORT_CONFLICT: "照片录入内容已更新，请重新读取。",
  VOCABULARY_RECOGNITION_FAILED: "手写单词识别失败，照片已保留，可以重试。",
  AI_DISABLED: "AI 学习助手当前已关闭，请先前往设置开启。",
  AI_NOT_CONFIGURED: "请先完成 AI 服务配置。",
  AI_TIMEOUT: "识别超时，照片已保留，可以重试。",
  AI_RATE_LIMITED: "AI 服务当前繁忙，请稍后重试。",
  DESKTOP_ONLY: "请在 Windows 桌面版中使用照片录入。",
};

export class VocabularyImportServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "VocabularyImportServiceError";
  }
}

export function toVocabularyImportServiceError(error: unknown) {
  if (error instanceof VocabularyImportServiceError) return error;
  const value = error as { code?: unknown } | null;
  const code = typeof value?.code === "string" ? value.code : "UNKNOWN";
  return new VocabularyImportServiceError(code, MESSAGES[code] ?? "照片录入未能完成，请稍后重试。");
}
