import { expect, it } from "vitest";
import { applyPlatformHints, detectRuntimePlatform } from "./platform";

it("detects an Android Tauri tablet", () => {
  expect(detectRuntimePlatform({
    hasTauri: true,
    userAgent: "Mozilla/5.0 (Linux; Android 15; vivo Pad3)",
  })).toBe("android");
});

it("detects a Windows Tauri desktop", () => {
  expect(detectRuntimePlatform({ hasTauri: true, userAgent: "Windows NT 10.0" }))
    .toBe("windows");
});

it("keeps an ordinary web preview separate from installed runtimes", () => {
  expect(detectRuntimePlatform({ hasTauri: false, userAgent: "Android" }))
    .toBe("browser");
});

it("marks touch-capable tablet input without changing application data", () => {
  const root = document.createElement("html");
  applyPlatformHints(root, {
    hasTauri: true,
    maxTouchPoints: 10,
    userAgent: "Android",
  });
  expect(root.dataset.inputMode).toBe("touch");
  expect(root.dataset.platform).toBe("android");
});

it("keeps pointer mode for ordinary desktop input", () => {
  const root = document.createElement("html");
  applyPlatformHints(root, {
    hasTauri: true,
    maxTouchPoints: 0,
    userAgent: "Windows NT 10.0",
  });
  expect(root.dataset.inputMode).toBe("pointer");
  expect(root.dataset.platform).toBe("windows");
});
