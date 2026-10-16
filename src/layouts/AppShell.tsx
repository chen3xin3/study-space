import { GraduationCap } from "lucide-react";
import { useEffect } from "react";
import { Outlet } from "react-router";
import { useSettings } from "../services/settings/SettingsProvider";
import { Sidebar } from "./Sidebar";
import { applyPlatformHints, currentPlatformEnvironment } from "../platform/platform";

export function AppShell() {
  const { settings } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.fontScale = settings.fontScale;
    root.dataset.density = settings.density;
  }, [settings.density, settings.fontScale, settings.theme]);

  useEffect(() => {
    applyPlatformHints(document.documentElement, currentPlatformEnvironment());
  }, []);

  return (
    <div className="app-window">
      <header className="brand-bar">
        <div className="brand-mark"><GraduationCap aria-hidden="true" size={25} /></div>
        <div>
          <strong>学习空间</strong>
          <span>专注当下，稳步积累</span>
        </div>
      </header>
      <div className="app-shell">
        <Sidebar />
        <main className="app-content" id="main-content" aria-label="学习内容">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
