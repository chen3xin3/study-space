interface PublicError {
  code?: unknown;
  message?: unknown;
}

function asPublicError(value: unknown): PublicError | null {
  return value !== null && typeof value === "object" ? value as PublicError : null;
}

export function focusErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message.trim()) return value.message;

  const structured = asPublicError(value);
  if (typeof structured?.message === "string" && structured.message.trim()) {
    return structured.message;
  }

  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

export function focusErrorCode(value: unknown): string | null {
  const structured = asPublicError(value);
  return typeof structured?.code === "string" ? structured.code : null;
}
