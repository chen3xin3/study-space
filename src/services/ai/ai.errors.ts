const MESSAGES: Record<string, string> = {
  AI_DISABLED: "AI 功能尚未开启。",
  AI_NOT_CONFIGURED: "请先完整填写 AI 设置并保存密钥。",
  AI_CREDENTIAL_FAILED: "AI 密钥未能安全保存，请重试。",
  AI_AUTH_FAILED: "AI 密钥验证失败，请检查密钥。",
  AI_RATE_LIMITED: "AI 服务当前繁忙，请稍后重试。",
  AI_TIMEOUT: "AI 响应超时，请稍后重试。",
  AI_PROVIDER_FAILED: "AI 服务暂时不可用，请稍后重试。",
  AI_RESPONSE_INVALID: "AI 返回的结果格式不正确，请重试。",
};

export class AiServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AiServiceError";
  }
}

export function toAiServiceError(error: unknown) {
  if (error instanceof AiServiceError) return error;
  const candidate = error as { code?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "UNKNOWN";
  return new AiServiceError(code, MESSAGES[code] ?? "AI 操作未能完成，请稍后重试。");
}
