const ERROR_MESSAGES: Record<string, string> = {
  DATA_DIRECTORY_UNAVAILABLE: "无法准备本地数据目录。",
  DATABASE_OPEN_FAILED: "无法打开本地数据库。",
  DATABASE_MIGRATION_FAILED: "数据库升级未能完成。",
  DATABASE_INTEGRITY_FAILED: "本地数据库完整性检查失败。",
  ATTACHMENT_INVALID: "所选文件无法导入。",
  ATTACHMENT_TOO_LARGE: "文件超过 100 MB，无法导入。",
  BACKUP_CREATE_FAILED: "完整备份创建失败。",
  BACKUP_INVALID: "所选备份文件无效或已损坏。",
  RESTORE_FAILED: "恢复未能完成，当前数据已保留。",
  DESKTOP_ONLY: "此功能需要在 Windows 桌面应用中使用。",
};

export class DataServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DataServiceError";
  }
}

export function toDataServiceError(error: unknown): DataServiceError {
  if (error instanceof DataServiceError) return error;

  const candidate = error as { code?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "UNKNOWN";
  return new DataServiceError(
    code,
    ERROR_MESSAGES[code] ?? "本地数据操作未能完成，请稍后重试。",
  );
}
