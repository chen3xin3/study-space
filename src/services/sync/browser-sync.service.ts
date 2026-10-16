import type { RestoreResult } from "../data/data.types";
import {
  SyncServiceError,
  type ReceivedSyncBackup,
  type RestoreReceivedInput,
  type SendSessionInfo,
  type SyncConnectionInput,
  type SyncService,
  type SyncSourcePreview,
} from "./sync.types";

export class BrowserSyncService implements SyncService {
  private unavailable(): never {
    throw new SyncServiceError("SYNC_UNAVAILABLE", "电脑与平板互联需要在安装版中使用。");
  }
  async startSending(_input: { settings: unknown; deviceName: string }): Promise<SendSessionInfo> { return this.unavailable(); }
  async getSendStatus(): Promise<SendSessionInfo | null> { return this.unavailable(); }
  async stopSending(): Promise<void> { return this.unavailable(); }
  async inspectSource(_input: SyncConnectionInput): Promise<SyncSourcePreview> { return this.unavailable(); }
  async receiveBackup(_preview: SyncSourcePreview): Promise<ReceivedSyncBackup> { return this.unavailable(); }
  async restoreReceived(_input: RestoreReceivedInput): Promise<RestoreResult> { return this.unavailable(); }
}

