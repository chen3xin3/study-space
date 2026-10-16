export type RuntimePlatform = "android" | "windows" | "browser";

export interface PlatformEnvironment {
  hasTauri: boolean;
  maxTouchPoints?: number;
  userAgent: string;
}

export function detectRuntimePlatform(
  environment: Pick<PlatformEnvironment, "hasTauri" | "userAgent">,
): RuntimePlatform {
  if (!environment.hasTauri) return "browser";
  return /Android/i.test(environment.userAgent) ? "android" : "windows";
}

export function currentPlatformEnvironment(): PlatformEnvironment {
  return {
    hasTauri: Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__),
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  };
}

export function applyPlatformHints(root: HTMLElement, environment: PlatformEnvironment): void {
  root.dataset.inputMode = (environment.maxTouchPoints ?? 0) > 0 ? "touch" : "pointer";
  root.dataset.platform = detectRuntimePlatform(environment);
}
