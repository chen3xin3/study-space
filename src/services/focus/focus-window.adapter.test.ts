import { vi } from "vitest";
import { RuntimeFocusWindowAdapter } from "./focus-window.adapter";

it("hides desktop pinning in a browser runtime", async () => {
  const adapter = new RuntimeFocusWindowAdapter(false, vi.fn());
  await expect(adapter.supportsAlwaysOnTop()).resolves.toBe(false);
  await expect(adapter.setAlwaysOnTop(true)).rejects.toThrow("不支持");
});

it("uses the current Tauri window when pinning is supported", async () => {
  const setAlwaysOnTop = vi.fn().mockResolvedValue(undefined);
  const loader = vi.fn().mockResolvedValue({ setAlwaysOnTop });
  const adapter = new RuntimeFocusWindowAdapter(true, loader);
  await expect(adapter.supportsAlwaysOnTop()).resolves.toBe(true);
  await adapter.setAlwaysOnTop(true);
  expect(setAlwaysOnTop).toHaveBeenCalledWith(true);
});
