import { useEffect, useState } from "react";
import { Bot, CalendarDays, Palette, ShieldCheck, SlidersHorizontal, WifiOff } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { PageHeader } from "../../components/ui/PageHeader";
import { Switch } from "../../components/ui/Switch";
import { useSettings } from "../../services/settings/SettingsProvider";
import type { Density, FontScale, MathType, ThemeId } from "../../services/settings/settings.types";
import { themes } from "../../themes/themes";
import { isValidExamDate } from "../../utils/date";
import { DataManagementCard } from "./DataManagementCard";
import { createAiService } from "../../services/ai/ai.service";
import type { AiService, SafeAiSettings } from "../../services/ai/ai.types";
import type { SyncService } from "../../services/sync/sync.types";
import { DiagnosticsCard } from "./DiagnosticsCard";
import { DesktopBehaviorCard } from "./DesktopBehaviorCard";
import { useRuntimePlatform } from "../../platform/useRuntimePlatform";
import { DeviceSyncCard } from "./DeviceSyncCard";
import "./settings.css";

export function SettingsPage({ aiService: suppliedAi, syncService }: { aiService?: AiService; syncService?: SyncService }) {
  const platform = useRuntimePlatform();
  const isWindows = platform === "windows";
  const { settings, updateSettings } = useSettings();
  const [aiService] = useState(() => suppliedAi ?? createAiService());
  const [desktopAi, setDesktopAi] = useState<SafeAiSettings | null>(null);
  const [providerName, setProviderName] = useState("OpenAI Compatible");
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const examDateInvalid = Boolean(settings.examDate) && !isValidExamDate(settings.examDate);

  useEffect(() => {
    void aiService.getSettings().then((value) => {
      setDesktopAi(value);
      setProviderName(value.providerName);
      setApiUrl(value.apiUrl);
      setModel(value.model);
      if (value.enabled !== settings.aiEnabled) updateSettings({ aiEnabled: value.enabled });
    }).catch((caught) => setAiError(caught instanceof Error ? caught.message : "桌面 AI 配置读取失败。"));
  }, [aiService]);

  const saveAi = async () => {
    if (!desktopAi) { setAiError("桌面 AI 配置尚未读取完成。"); return; }
    setAiBusy(true); setAiError(""); setAiMessage("");
    try {
      let saved = await aiService.updateSettings({ enabled: settings.aiEnabled, providerName, apiUrl, model, version: desktopAi.version });
      if (apiKey.trim()) { saved = await aiService.setApiKey(apiKey.trim()); setApiKey(""); }
      setDesktopAi(saved);
      setAiMessage("AI 配置已安全保存，可用于单词和作文照片识别。");
    } catch (caught) { setAiError(caught instanceof Error ? caught.message : "AI 配置保存失败。"); }
    finally { setAiBusy(false); }
  };

  const testAi = async () => {
    setAiBusy(true); setAiError(""); setAiMessage("");
    try { await aiService.testConnection(); setAiMessage("连接测试成功。"); }
    catch (caught) { setAiError(caught instanceof Error ? caught.message : "连接测试失败。"); }
    finally { setAiBusy(false); }
  };
  return (
    <div className="page settings-page">
      <PageHeader eyebrow="应用设置" title="让空间更适合你" description={`外观和基础偏好会保存在这台${platform === "android" ? "设备" : "电脑"}上，重新打开后继续生效。`} />
      <nav className="settings-nav" aria-label="设置分类" id="appearance"><a href="#appearance">外观</a><a href="#preferences">学习目标</a><a href="#preferences">阅读体验</a>{isWindows ? <a href="#desktop-behavior">桌面行为</a> : null}<a href="#data-management">数据管理</a><a href="#device-sync">设备互联</a>{isWindows ? <a href="#diagnostics">问题诊断</a> : null}<a href="#ai-assistant">AI 助手</a></nav>
      <Card className="settings-section"><div className="settings-section__heading"><Palette aria-hidden="true" /><div><h2>主题</h2><p>学科色保持一致，背景与阅读层次随主题变化。</p></div></div><div className="theme-grid">{themes.map((theme) => <label key={theme.id} className={`theme-option theme-option--${theme.id}${settings.theme === theme.id ? " is-selected" : ""}`}><input type="radio" name="theme" aria-label={`主题 ${theme.name}`} checked={settings.theme === theme.id} onChange={() => updateSettings({ theme: theme.id as ThemeId })} /><span className="theme-option__preview"><i /><i /><i /></span><strong>{theme.name}</strong><small>{theme.description}</small></label>)}</div></Card>
      <div className="settings-grid" id="preferences">
      <Card className="settings-section"><div className="settings-section__heading"><CalendarDays aria-hidden="true" /><div><h2>学习目标</h2><p>用于首页倒计时和数学内容结构。</p></div></div><label className="field"><span>考试日期</span><input aria-label="考试日期" aria-invalid={examDateInvalid} aria-describedby={examDateInvalid ? "exam-date-error" : undefined} type="date" value={settings.examDate} onChange={(event) => updateSettings({ examDate: event.target.value })} />{examDateInvalid ? <small className="field-error" id="exam-date-error">请输入真实存在的日期。</small> : null}</label><label className="field"><span>数学类型</span><select aria-label="数学类型" value={settings.mathType} onChange={(event) => updateSettings({ mathType: event.target.value as MathType })}><option value="math-1">数学一</option><option value="math-2">数学二</option><option value="math-3">数学三</option></select></label></Card>
        <Card className="settings-section"><div className="settings-section__heading"><SlidersHorizontal aria-hidden="true" /><div><h2>阅读体验</h2><p>调整字号和页面留白。</p></div></div><label className="field"><span>字体大小</span><select aria-label="字体大小" value={settings.fontScale} onChange={(event) => updateSettings({ fontScale: event.target.value as FontScale })}><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label><label className="field"><span>界面密度</span><select aria-label="界面密度" value={settings.density} onChange={(event) => updateSettings({ density: event.target.value as Density })}><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label></Card>
      </div>
      {isWindows ? <DesktopBehaviorCard /> : null}
      <DataManagementCard
        deviceNoun={platform === "android" ? "设备" : "电脑"}
        settings={settings}
        onSettingsRestored={(restored) => updateSettings(restored)}
      />
      <DeviceSyncCard service={syncService} settings={settings} platform={platform} onSettingsRestored={(restored) => updateSettings(restored)} />
      {isWindows ? <DiagnosticsCard /> : null}
      <span className="settings-anchor-target" id="ai-assistant" aria-hidden="true" />
      <Card className="settings-section ai-settings"><div className="settings-row"><div className="settings-section__heading"><Bot aria-hidden="true" /><div><h2>AI 学习助手</h2><p>照片识别只会在你主动确认发送后调用。</p></div></div><Switch label="启用 AI 学习助手" checked={settings.aiEnabled} onChange={(aiEnabled) => updateSettings({ aiEnabled })} /></div>{settings.aiEnabled ? <div className="ai-config"><h3>AI 服务配置</h3><div className="ai-config__summary"><span><ShieldCheck aria-hidden="true" />密钥通过{platform === "android" ? "设备" : "桌面"}安全存储保存</span><span><WifiOff aria-hidden="true" />普通学习功能始终支持离线</span></div><div className="ai-config__fields"><label className="field"><span>服务名称</span><input aria-label="服务名称" value={providerName} onChange={(event) => setProviderName(event.target.value)} /></label><label className="field field-wide"><span>API 地址</span><input aria-label="API 地址" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label><label className="field"><span>模型</span><input aria-label="模型" value={model} onChange={(event) => setModel(event.target.value)} placeholder="支持图片的模型名称" /></label><label className="field"><span>API Key</span><input aria-label="API Key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={desktopAi?.hasApiKey ? "已保存；留空表示不修改" : "输入密钥"} /></label></div><div className="ai-config__actions"><button className="primary-button" type="button" disabled={aiBusy || !providerName.trim() || !apiUrl.trim() || !model.trim()} onClick={() => void saveAi()}>{aiBusy ? "正在保存…" : "保存 AI 配置"}</button><button className="secondary-button" type="button" disabled={aiBusy || !desktopAi?.hasApiKey} onClick={() => void testAi()}>测试连接</button></div>{aiMessage ? <p className="form-message form-message--success" role="status">{aiMessage}</p> : null}{aiError ? <p className="form-message form-message--error" role="alert">{aiError}</p> : null}</div> : <Notice>AI 已关闭，不会显示照片识别和批改调用，也不会发起 AI 网络请求。</Notice>}</Card>
    </div>
  );
}
