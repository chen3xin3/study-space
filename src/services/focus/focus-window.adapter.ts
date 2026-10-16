export interface FocusWindowAdapter {
  supportsAlwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
}

type WindowHandle = { setAlwaysOnTop(enabled: boolean): Promise<void> };
type WindowLoader = () => Promise<WindowHandle>;

async function loadCurrentWindow(): Promise<WindowHandle> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export class RuntimeFocusWindowAdapter implements FocusWindowAdapter {
  constructor(private readonly tauriRuntime = typeof window !== "undefined" && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__), private readonly loader: WindowLoader = loadCurrentWindow) {}
  async supportsAlwaysOnTop(): Promise<boolean> { return this.tauriRuntime; }
  async setAlwaysOnTop(enabled: boolean): Promise<void> {
    if (!this.tauriRuntime) throw new Error("当前环境不支持窗口置顶");
    const currentWindow = await this.loader();
    await currentWindow.setAlwaysOnTop(enabled);
  }
}
