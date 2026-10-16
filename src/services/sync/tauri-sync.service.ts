import { invoke } from "@tauri-apps/api/core";
import type { RestoreResult } from "../data/data.types";
import {
  toSyncServiceError,
  type ReceivedSyncBackup,
  type RestoreReceivedInput,
  type SendSessionInfo,
  type SyncConnectionInput,
  type SyncService,
  type SyncSourcePreview,
} from "./sync.types";

export class TauriSyncService implements SyncService {
  startSending(input: { settings: unknown; deviceName: string }): Promise<SendSessionInfo> {
    return this.run(() => invoke("start_lan_sync_send", input));
  }

  getSendStatus(): Promise<SendSessionInfo | null> {
    return this.run(() => invoke("get_lan_sync_send_status"));
  }

  stopSending(): Promise<void> {
    return this.run(() => invoke("stop_lan_sync_send"));
  }

  async inspectSource(input: SyncConnectionInput): Promise<SyncSourcePreview> {
    try {
      return await invoke("inspect_lan_sync_source", { ...input });
    } catch (error) {
      throw toSyncServiceError(error);
    }
  }

  receiveBackup(preview: SyncSourcePreview): Promise<ReceivedSyncBackup> {
    return this.run(() => invoke("receive_lan_sync_backup", { preview }));
  }

  restoreReceived(input: RestoreReceivedInput): Promise<RestoreResult> {
    return this.run(() => invoke("restore_lan_sync_backup", { ...input }));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) { throw toSyncServiceError(error); }
  }
}

