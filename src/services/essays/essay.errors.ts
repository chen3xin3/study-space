const MESSAGES: Record<string, string> = {
  ESSAY_INVALID: "作文信息不完整或格式不正确。",
  ESSAY_NOT_FOUND: "没有找到这篇作文。",
  ESSAY_VERSION_CONFLICT: "内容已在其他位置更新，请重新读取后再保存。",
  ESSAY_OPERATION_FAILED: "作文操作未能完成，请稍后重试。",
  DESKTOP_ONLY: "请在 Windows 桌面版中保存作文。",
};

export class EssayServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "EssayServiceError";
  }
}

export function toEssayServiceError(error: unknown) {
  if (error instanceof EssayServiceError) return error;
  const candidate = error as { code?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "UNKNOWN";
  return new EssayServiceError(
    code,
    MESSAGES[code] ?? "作文操作未能完成，请稍后重试。",
  );
}
