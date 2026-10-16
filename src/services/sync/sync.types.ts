import type { RestoreResult } from "../data/data.types";

export type SendSessionStatus = "preparing" | "waiting" | "transferring" | "completed" | "stopped" | "expired" | "failed";

export interface SyncManifest {
  protocolVersion: number;
  appVersion: string;
  deviceName: string;
  platform: string;
  createdAt: string;
  byteSize: number;
  attachmentCount: number;
  sha256: string;
}

export interface SendSessionInfo {
  address: string;
  pairingCode: string;
  expiresAt: string;
  status: SendSessionStatus;
  manifest: SyncManifest;
}

export interface SyncConnectionInput { address: string; pairingCode: string }

export interface SyncSourcePreview {
  address: string;
  sessionToken: string;
  manifest: SyncManifest;
}

export interface ReceivedSyncBackup {
  stagedPath: string;
  expectedFingerprint: string;
  manifest: SyncManifest;
}

export interface RestoreReceivedInput {
  stagedPath: string;
  expectedFingerprint: string;
  currentSettings: unknown;
}

export interface SyncService {
  startSending(input: { settings: unknown; deviceName: string }): Promise<SendSessionInfo>;
  getSendStatus(): Promise<SendSessionInfo | null>;
  stopSending(): Promise<void>;
  inspectSource(input: SyncConnectionInput): Promise<SyncSourcePreview>;
  receiveBackup(preview: SyncSourcePreview): Promise<ReceivedSyncBackup>;
  restoreReceived(input: RestoreReceivedInput): Promise<RestoreResult>;
}

export class SyncServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SyncServiceError";
  }
}

const messages: Record<string, string> = {
  SYNC_ADDRESS_INVALID: "请输入发送端显示的局域网地址。",
  SYNC_CONNECTION_FAILED: "无法连接发送设备，请检查两台设备是否在同一网络。",
  SYNC_PAIRING_FAILED: "连接码错误、已过期或已经使用。",
  SYNC_PROTOCOL_INCOMPATIBLE: "两台设备的互联版本不兼容，请更新应用。",
  SYNC_TOO_LARGE: "要接收的数据超过当前支持的大小。",
  SYNC_CHECKSUM_MISMATCH: "传输校验失败，本机数据没有改变。",
  SYNC_TRANSFER_FAILED: "数据传输中断，本机数据没有改变。",
  SYNC_UNAVAILABLE: "电脑与平板互联需要在安装版中使用。",
};

export function toSyncServiceError(error: unknown): SyncServiceError {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "SYNC_UNKNOWN";
  const fallback = typeof candidate?.message === "string" && candidate.message !== "[object Object]"
    ? candidate.message
    : "互联操作未能完成，请稍后重试。";
  return new SyncServiceError(code, messages[code] ?? fallback);
}

