import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Database, FilePlus2, RefreshCw, RotateCcw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { createDataService } from "../../services/data/data.service";
import type { DataService, DataStatus } from "../../services/data/data.types";
import { sanitizeSettings } from "../../services/settings/settings.repository";
import type { AppSettings } from "../../services/settings/settings.types";

interface DataManagementCardProps {
  deviceNoun?: "电脑" | "设备";
  service?: DataService;
  settings: AppSettings;
  onSettingsRestored: (settings: AppSettings) => void;
}

type Operation = "checking" | "importing" | "backing-up" | "restoring" | null;

export function DataManagementCard({
  deviceNoun = "电脑",
  service,
  settings,
  onSettingsRestored,
}: DataManagementCardProps) {
  const dataService = useMemo(() => service ?? createDataService(), [service]);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [operation, setOperation] = useState<Operation>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (showFeedback = false) => {
    setError(null);
    try {
      const nextStatus = await dataService.getStatus();
      setStatus(nextStatus);
      if (showFeedback) setMessage("本地数据检查完成，一切正常。");
    } catch (cause) {
      setStatus(null);
      setError(toUserMessage(cause));
    }
  }, [dataService]);

  useEffect(() => {
    let active = true;
    dataService.getStatus()
      .then((nextStatus) => { if (active) setStatus(nextStatus); })
      .catch((cause) => { if (active) setError(toUserMessage(cause)); })
      .finally(() => { if (active) setOperation(null); });
    return () => { active = false; };
  }, [dataService]);

  async function run(operationName: Exclude<Operation, "checking" | null>, action: () => Promise<void>) {
    setOperation(operationName);
    setMessage(null);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setOperation(null);
    }
  }

  async function checkData() {
    setOperation("checking");
    setMessage(null);
    await refreshStatus(true);
    setOperation(null);
  }

  async function importAttachment() {
    await run("importing", async () => {
      const attachment = await dataService.chooseAndImportAttachment();
      if (!attachment) return;
      setMessage(`“${attachment.originalName}”已安全导入本地空间。`);
      await refreshStatus();
    });
  }

  async function createBackup() {
    await run("backing-up", async () => {
      const backup = await dataService.createBackup(settings);
      if (!backup) return;
      setMessage(`完整备份已创建：${backup.path}`);
      await refreshStatus();
    });
  }

  async function restoreBackup() {
    await run("restoring", async () => {
      const backupPath = await dataService.chooseBackup();
      if (!backupPath) return;
      const preview = await dataService.inspectBackup(backupPath);
      const confirmed = window.confirm(
        `即将恢复备份：\n${preview.path}\n备份时间：${formatDateTime(preview.createdAt)}\n\n恢复会替换当前本地数据，应用会先自动创建保护备份。确定继续吗？`,
      );
      if (!confirmed) return;
      const restored = await dataService.restoreBackup(backupPath, preview.fingerprint, settings);
      onSettingsRestored(sanitizeSettings(restored.settings));
      setMessage("备份已恢复，界面设置也已安全更新。");
      await refreshStatus();
    });
  }

  const busy = operation !== null;
  const desktopUnavailable = status?.state === "error";

  return (
    <Card className="settings-section data-management" id="data-management">
      <div className="settings-row data-management__header">
        <div className="settings-section__heading">
          <Database aria-hidden="true" />
          <div>
            <h2>本地数据与备份</h2>
            <p>学习记录、附件和设置都保存在这台{deviceNoun}上。</p>
          </div>
        </div>
        <span className={`data-health ${status?.state === "ready" ? "is-ready" : ""}`}>
          {operation === "checking" ? "正在检查…" : status?.state === "ready" ? "本地数据正常" : "桌面端可用"}
        </span>
      </div>

      {status ? (
        <div className="data-summary" aria-label="本地数据状态">
          <span><strong>{status.attachmentCount} 个附件</strong><small>已纳入本地管理</small></span>
          <span><strong>数据库版本 {status.schemaVersion}</strong><small title={status.databasePath}>{status.databasePath}</small></span>
          <span><strong>{status.lastBackupAt ? "已有完整备份" : "尚未创建备份"}</strong><small title={status.lastBackupAt ?? undefined}>{status.lastBackupAt ? formatDateTime(status.lastBackupAt) : "建议首次使用后创建一次"}</small></span>
        </div>
      ) : null}

      <div className="data-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={checkData}>
          <RefreshCw aria-hidden="true" size={16} />{operation === "checking" ? "正在检查…" : "检查数据"}
        </button>
        <button className="secondary-button" type="button" disabled={busy || desktopUnavailable} onClick={importAttachment}>
          <FilePlus2 aria-hidden="true" size={16} />{operation === "importing" ? "正在导入…" : "导入测试文件"}
        </button>
        <button className="primary-button" type="button" disabled={busy || desktopUnavailable} onClick={createBackup}>
          <Archive aria-hidden="true" size={16} />{operation === "backing-up" ? "正在创建备份…" : "创建完整备份"}
        </button>
        <button className="secondary-button" type="button" disabled={busy || desktopUnavailable} onClick={restoreBackup}>
          <RotateCcw aria-hidden="true" size={16} />{operation === "restoring" ? "正在恢复…" : "从备份恢复"}
        </button>
      </div>

      {message ? <Notice>{message}</Notice> : null}
      {error ? <div className="data-error" role="alert">{error}</div> : null}
      {desktopUnavailable ? <Notice>浏览器里只展示界面；本地数据操作请使用 Windows 桌面版。</Notice> : null}
    </Card>
  );
}

function toUserMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "本地数据操作未能完成，请稍后重试。";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}
