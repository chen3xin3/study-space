const ERROR_MESSAGES: Record<string, string> = {
  WORD_INVALID: "单词信息不完整或格式不正确。",
  WORD_NOT_FOUND: "没有找到这个单词。",
  WORD_VERSION_CONFLICT: "这个单词已在其他位置更新，请重新读取后再保存。",
  VOCABULARY_OPERATION_FAILED: "单词操作未能完成，请稍后重试。",
  DESKTOP_ONLY: "请在 Windows 桌面版中使用。",
};

export class VocabularyServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VocabularyServiceError";
  }
}

export function toVocabularyServiceError(error: unknown): VocabularyServiceError {
  if (error instanceof VocabularyServiceError) return error;
  const candidate = error as { code?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "UNKNOWN";
  return new VocabularyServiceError(
    code,
    ERROR_MESSAGES[code] ?? "单词操作未能完成，请稍后重试。",
  );
}
