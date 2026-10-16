import { useEffect, useMemo, useState } from "react";
import { Bug, FileDown, FolderOpen } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { createDiagnosticsService } from "../../services/diagnostics/diagnostics.service";
import type { DiagnosticsService, DiagnosticStatus } from "../../services/diagnostics/diagnostics.types";

export function DiagnosticsCard({ service }: { service?: DiagnosticsService }) {
  const diagnostics = useMemo(() => service ?? createDiagnosticsService(), [service]);
  const [status, setStatus] = useState<DiagnosticStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    diagnostics.getStatus().then((value) => { if (active) setStatus(value); })
      .catch(() => { if (active) setError("诊断状态读取失败。"); });
    return () => { active = false; };
  }, [diagnostics]);

  const run = async (action: () => Promise<string | null | void>, success: (value: string | null | void) => string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const value = await action();
      const next = success(value);
      if (next) setMessage(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "诊断操作失败，请重试。");
    } finally { setBusy(false); }
  };

  return <Card className="settings-section" id="diagnostics">
    <div className="settings-row">
      <div className="settings-section__heading"><Bug aria-hidden="true" /><div><h2>问题诊断</h2><p>崩溃与启动记录只保存在本机，不包含学习内容和密钥。</p></div></div>
      <span className={`data-health ${status?.healthy ? "is-ready" : ""}`}>{status ? status.healthy ? "运行正常" : "仅桌面版可用" : "正在检查…"}</span>
    </div>
    {status?.healthy ? <div className="data-summary" aria-label="诊断状态"><span><strong>版本 {status.appVersion}</strong><small>当前桌面版本</small></span><span><strong>数据库版本 {status.schemaVersion}</strong><small>{status.attachmentCount} 个本地附件</small></span><span><strong>{status.recentEvents.length} 条近期记录</strong><small title={status.logDirectory}>{status.logDirectory}</small></span></div> : null}
    <div className="data-actions">
      <button className="secondary-button" type="button" disabled={busy || !status?.healthy} onClick={() => void run(() => diagnostics.openLogFolder(), () => "已打开日志目录。")}><FolderOpen size={16} />打开日志目录</button>
      <button className="primary-button" type="button" disabled={busy || !status?.healthy} onClick={() => void run(() => diagnostics.exportReport(), (path) => path ? `诊断报告已导出：${path}` : "")}><FileDown size={16} />导出诊断报告</button>
    </div>
    {message ? <Notice>{message}</Notice> : null}
    {error ? <div className="data-error" role="alert">{error}</div> : null}
  </Card>;
}

