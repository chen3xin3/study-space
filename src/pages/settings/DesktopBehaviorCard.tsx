import { useEffect, useMemo, useState } from "react";
import { MonitorCog } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { Switch } from "../../components/ui/Switch";
import { createDesktopService } from "../../services/desktop/desktop.service";
import type { DesktopPreferences, DesktopService } from "../../services/desktop/desktop.types";

export function DesktopBehaviorCard({ service }: { service?: DesktopService }) {
  const desktop = useMemo(() => service ?? createDesktopService(), [service]);
  const [preferences, setPreferences] = useState<DesktopPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    desktop.getPreferences()
      .then((value) => { if (active) setPreferences(value); })
      .catch(() => { if (active) setError("桌面偏好读取失败。"); });
    return () => { active = false; };
  }, [desktop]);

  const update = async (patch: Partial<DesktopPreferences>) => {
    if (!preferences) return;
    const previous = preferences;
    const next = { ...preferences, ...patch };
    setPreferences(next); setBusy(true); setMessage(""); setError("");
    try {
      const saved = await desktop.updatePreferences(next);
      setPreferences(saved);
      setMessage(patch.closeToTray === true
        ? "已启用关闭到托盘。关闭窗口后，软件会留在右下角托盘；需要完全退出时，请右键托盘图标选择“退出”。"
        : "桌面偏好已保存。");
    } catch (cause) {
      setPreferences(previous);
      setError(cause instanceof Error ? cause.message : "桌面偏好保存失败。");
    } finally { setBusy(false); }
  };

  return <Card className="settings-section" id="desktop-behavior">
    <div className="settings-section__heading"><MonitorCog aria-hidden="true" /><div><h2>桌面行为</h2><p>按你的使用习惯决定软件如何驻留和启动。</p></div></div>
    <div className="settings-list">
      <div className="settings-row"><div><strong>关闭窗口时最小化到托盘</strong><p>关闭后仍在后台运行，可从任务栏托盘重新打开。</p></div><Switch label="关闭窗口时最小化到托盘" checked={preferences?.closeToTray ?? false} disabled={busy || !preferences} onChange={(closeToTray) => void update({ closeToTray })} /></div>
      <div className="settings-row"><div><strong>开机自动启动</strong><p>登录 Windows 后自动启动，仅影响当前用户。</p></div><Switch label="开机自动启动" checked={preferences?.launchAtStartup ?? false} disabled={busy || !preferences} onChange={(launchAtStartup) => void update({ launchAtStartup })} /></div>
    </div>
    <Notice>随时按 Ctrl + Shift + Space，可从其他软件快速唤回主窗口。</Notice>
    {message ? <p className="form-message form-message--success" role="status">{message}</p> : null}
    {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
  </Card>;
}
