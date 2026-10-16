import { BarChart3, Headphones, Maximize2, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";

export interface FocusQuickToolsProps { settingsDisabled: boolean; onOpenSettings(): void; onOpenEnvironment(): void; onImmersive(): void }

export function FocusQuickTools({ settingsDisabled, onOpenSettings, onOpenEnvironment, onImmersive }: FocusQuickToolsProps) {
  return <nav className="focus-quick-tools" aria-label="专注快捷工具" data-art-direction="spectrum-tool-dock"><button aria-label="专注设置" disabled={settingsDisabled} onClick={onOpenSettings}><SlidersHorizontal /><span>设置</span></button><button aria-label="专注环境" onClick={onOpenEnvironment}><Headphones /><span>环境</span></button><button aria-label="沉浸模式" onClick={onImmersive}><Maximize2 /><span>沉浸</span></button><Link aria-label="查看统计" to="/statistics"><BarChart3 /><span>统计</span></Link></nav>;
}
