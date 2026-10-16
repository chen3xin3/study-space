import { describe, expect, it, vi } from "vitest";
import { createFocusCompletionNotifier, type FocusNotificationDriver } from "./focus-completion-notifier";

function driver(overrides: Partial<FocusNotificationDriver> = {}): FocusNotificationDriver {
  return {
    isPermissionGranted: vi.fn().mockResolvedValue(true),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("focus completion notifier", () => {
  it("sends immediately when notification permission is already granted", async () => {
    const notificationDriver = driver();
    const cue = { play: vi.fn() };
    const notifier = createFocusCompletionNotifier({ driver: notificationDriver, cue });

    await expect(notifier.notify("work")).resolves.toEqual({
      delivered: true,
      fallbackMessage: "本轮专注已结束，可以休息一下。",
    });
    expect(notificationDriver.requestPermission).not.toHaveBeenCalled();
    expect(notificationDriver.send).toHaveBeenCalledWith("学习空间", "本轮专注已结束，可以休息一下。");
    expect(cue.play).not.toHaveBeenCalled();
  });

  it("requests permission only when the platform has not decided yet", async () => {
    const notificationDriver = driver({ isPermissionGranted: vi.fn().mockResolvedValue(false) });
    const notifier = createFocusCompletionNotifier({ driver: notificationDriver, cue: { play: vi.fn() } });

    await expect(notifier.notify("break")).resolves.toMatchObject({ delivered: true });
    expect(notificationDriver.requestPermission).toHaveBeenCalledTimes(1);
    expect(notificationDriver.send).toHaveBeenCalledWith("学习空间", "休息结束，准备开始下一轮。");
  });

  it("falls back to a local cue when permission is denied", async () => {
    const cue = { play: vi.fn() };
    const notificationDriver = driver({
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });
    const notifier = createFocusCompletionNotifier({ driver: notificationDriver, cue });

    await expect(notifier.notify("work")).resolves.toEqual({
      delivered: false,
      fallbackMessage: "本轮专注已结束，可以休息一下。",
    });
    expect(notificationDriver.send).not.toHaveBeenCalled();
    expect(cue.play).toHaveBeenCalledTimes(1);
  });

  it("treats the platform default permission as not granted", async () => {
    const cue = { play: vi.fn() };
    const notificationDriver = driver({
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn().mockResolvedValue("default"),
    });
    const notifier = createFocusCompletionNotifier({ driver: notificationDriver, cue });

    await expect(notifier.notify("work")).resolves.toMatchObject({ delivered: false });
    expect(notificationDriver.send).not.toHaveBeenCalled();
    expect(cue.play).toHaveBeenCalledTimes(1);
  });

  it("does not throw when system delivery or the local cue fails", async () => {
    const notificationDriver = driver({ send: vi.fn().mockRejectedValue(new Error("unavailable")) });
    const cue = { play: vi.fn(() => { throw new Error("audio unavailable"); }) };
    const notifier = createFocusCompletionNotifier({ driver: notificationDriver, cue });

    await expect(notifier.notify("break")).resolves.toEqual({
      delivered: false,
      fallbackMessage: "休息结束，准备开始下一轮。",
    });
  });

  it("uses the honest in-app fallback in browser preview", async () => {
    const cue = { play: vi.fn() };
    const notifier = createFocusCompletionNotifier({ driver: null, cue });

    await expect(notifier.notify("work")).resolves.toMatchObject({ delivered: false });
    expect(cue.play).toHaveBeenCalledTimes(1);
  });
});
