import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Download, Send, ShieldCheck, Square } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { sanitizeSettings } from "../../services/settings/settings.repository";
import type { AppSettings } from "../../services/settings/settings.types";
import { createSyncService } from "../../services/sync/sync.service";
import type { SendSessionInfo, SyncService, SyncSourcePreview } from "../../services/sync/sync.types";
import type { RuntimePlatform } from "../../platform/platform";

interface DeviceSyncCardProps {
  service?: SyncService;
  settings: AppSettings;
  platform: RuntimePlatform;
  onSettingsRestored: (settings: AppSettings) => void;
}

type Mode = "idle" | "send" | "receive";
type ReceivePhase = "editing" | "inspecting" | "preview" | "downloading" | "restoring" | "success";

export function DeviceSyncCard({ service, settings, platform, onSettingsRestored }: DeviceSyncCardProps) {
  const sync = useMemo(() => service ?? createSyncService(), [service]);
  const [mode, setMode] = useState<Mode>("idle");
  const [session, setSession] = useState<SendSessionInfo | null>(null);
  const [address, setAddress] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [preview, setPreview] = useState<SyncSourcePreview | null>(null);
  const [phase, setPhase] = useState<ReceivePhase>("editing");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);

  useEffect(() => () => {
    if (sending.current) void sync.stopSending();
  }, [sync]);

  useEffect(() => {
    if (mode !== "send" || !session || !["waiting", "transferring"].includes(session.status)) return;
    const timer = window.setInterval(() => {
      void sync.getSendStatus().then((next) => {
        if (!next) return;
        setSession(next);
        if (["completed", "stopped", "expired", "failed"].includes(next.status)) sending.current = false;
      }).catch((cause) => setError(messageOf(cause)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, session?.status, sync]);

  async function beginSending() {
    setMode("send"); setError("");
    try {
      const next = await sync.startSending({ settings, deviceName: platform === "android" ? "Android 平板" : "Windows 电脑" });
      sending.current = true;
      setSession(next);
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function stopSending() {
    try { await sync.stopSending(); }
    catch (cause) { setError(messageOf(cause)); }
    sending.current = false;
    setMode("idle"); setSession(null);
  }

  async function inspectSource() {
    setError(""); setPhase("inspecting"); setConfirmed(false);
    try {
      const next = await sync.inspectSource({ address: address.trim(), pairingCode });
      setPreview(next); setPhase("preview");
    } catch (cause) { setError(messageOf(cause)); setPhase("editing"); }
  }

  async function receiveAndRestore() {
    if (!preview || !confirmed) return;
    setError(""); setPhase("downloading");
    try {
      const received = await sync.receiveBackup(preview);
      setPhase("restoring");
      const restored = await sync.restoreReceived({
        stagedPath: received.stagedPath,
        expectedFingerprint: received.expectedFingerprint,
        currentSettings: settings,
      });
      onSettingsRestored(sanitizeSettings(restored.settings));
      setPhase("success");
    } catch (cause) { setError(messageOf(cause)); setPhase("preview"); }
  }

  function beginReceiving() {
    setMode("receive"); setPhase("editing"); setPreview(null); setConfirmed(false); setError("");
  }

  return (
    <Card className="settings-section device-sync" id="device-sync">
      <div className="settings-row device-sync__header">
        <div className="settings-section__heading">
          <ArrowLeftRight aria-hidden="true" />
          <div><h2>电脑与平板互联</h2><p>同一 Wi-Fi 下直接传输完整学习数据，不经过云端。</p></div>
        </div>
        <span className="device-sync__privacy"><ShieldCheck aria-hidden="true" size={16} />手动确认后才会替换</span>
      </div>

      {mode === "idle" ? <div className="device-sync__choices">
        <button className="device-sync__choice" type="button" aria-label="发送当前数据" onClick={() => void beginSending()}><Send aria-hidden="true" /><span><strong>发送当前数据</strong><small>让另一台设备接收这台设备的完整快照</small></span></button>
        <button className="device-sync__choice device-sync__choice--receive" type="button" aria-label="接收另一台设备的数据" onClick={beginReceiving}><Download aria-hidden="true" /><span><strong>接收另一台设备的数据</strong><small>先查看来源和内容，再确认替换本机数据</small></span></button>
      </div> : null}

      {mode === "send" ? <div className="device-sync__panel">
        {session ? <>
          <div className="device-sync__connection"><span><small>局域网地址</small><strong>{session.address}</strong></span><span><small>一次性加密连接码</small><strong className="device-sync__code">{session.pairingCode}</strong></span></div>
          <p className="device-sync__summary">{session.manifest.deviceName} · {formatBytes(session.manifest.byteSize)} · {session.manifest.attachmentCount} 个附件</p>
          <p className="device-sync__hint">在另一台设备输入上面的地址和连接码。数据会端到端加密；连接码十分钟内有效，只能使用一次。</p>
          <div className="device-sync__actions"><button className="secondary-button" type="button" onClick={() => void stopSending()}><Square aria-hidden="true" size={16} />停止发送</button></div>
        </> : <p role="status">正在准备安全快照…</p>}
      </div> : null}

      {mode === "receive" ? <div className="device-sync__panel">
        {phase === "editing" || phase === "inspecting" ? <>
          <div className="device-sync__fields"><label className="field"><span>局域网地址</span><input aria-label="局域网地址" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="例如 192.168.1.2:43000" /></label><label className="field"><span>连接码</span><input aria-label="连接码" inputMode="text" autoCapitalize="characters" maxLength={23} value={pairingCode} onChange={(event) => setPairingCode(formatConnectionCode(event.target.value))} placeholder="例如 ABCDE-FGHJK-MNPQR-STUVW" /></label></div>
          <div className="device-sync__actions"><button className="primary-button" type="button" disabled={phase === "inspecting" || !address.trim() || compactConnectionCode(pairingCode).length !== 20} onClick={() => void inspectSource()}>{phase === "inspecting" ? "正在连接…" : "查看可接收数据"}</button><button className="secondary-button" type="button" onClick={() => setMode("idle")}>取消</button></div>
        </> : null}

        {preview && ["preview", "downloading", "restoring"].includes(phase) ? <div className="device-sync__preview">
          <div className="device-sync__source"><span><small>来源设备</small><strong>{preview.manifest.deviceName}</strong></span><span><small>创建时间</small><strong>{formatTime(preview.manifest.createdAt)}</strong></span><span><small>数据大小</small><strong>{formatBytes(preview.manifest.byteSize)}</strong></span><span><small>附件</small><strong>{preview.manifest.attachmentCount} 个</strong></span></div>
          <p className="device-sync__warning">将替换这台设备上的当前数据。开始恢复前，应用会自动创建本机保护备份；传输或校验失败不会修改当前数据。</p>
          <label className="device-sync__confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>我知道接收会替换本机当前数据，并已确认来源设备正确</span></label>
          <div className="device-sync__actions"><button className="primary-button" type="button" disabled={!confirmed || phase !== "preview"} onClick={() => void receiveAndRestore()}>{phase === "downloading" ? "正在接收并校验…" : phase === "restoring" ? "正在创建保护备份并恢复…" : "确认接收并替换"}</button><button className="secondary-button" type="button" disabled={phase !== "preview"} onClick={() => { setPreview(null); setPhase("editing"); }}>返回</button></div>
        </div> : null}

        {phase === "success" ? <div className="device-sync__success" role="status"><ShieldCheck aria-hidden="true" /><div><strong>数据已接收并恢复完成</strong><p>完整性校验已通过，本机原数据也已保留为保护备份。</p></div></div> : null}
      </div> : null}

      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    </Card>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "互联操作未能完成，请稍后重试。";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function compactConnectionCode(value: string): string {
  return value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "").slice(0, 20);
}

function formatConnectionCode(value: string): string {
  return compactConnectionCode(value).match(/.{1,5}/g)?.join("-") ?? "";
}

