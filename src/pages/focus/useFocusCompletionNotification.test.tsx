import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusSession } from "../../services/focus/focus.types";
import type { FocusCompletionNotifier } from "../../services/notifications/focus-completion-notifier";
import type { FocusClockState } from "./useFocusClock";
import { FOCUS_NOTIFICATION_STORAGE_KEY, useFocusCompletionNotification } from "./useFocusCompletionNotification";

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    mode: "pomodoro", subject: "english", goal: "精读", workSeconds: 1500,
    breakSeconds: 300, longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4,
    autoStartBreak: false, autoStartWork: false, planId: null, presetId: "builtin-25-5",
    phase: "work", phaseStartedAt: "2026-10-10T01:00:00Z", cycleNumber: 1, cycleStartSeconds: 0,
    timer: { id: "timer-1", status: "running", currentStartedAt: "2026-10-10T01:00:00Z", accumulatedSeconds: 1500, endedAt: null, createdAt: "now", updatedAt: "now", version: 1 },
    ...overrides,
  };
}

function clock(expired: boolean): FocusClockState {
  return { elapsed: 1500, phaseElapsed: 1500, remaining: expired ? 0 : 1, progress: expired ? 100 : 99, activeBreakSeconds: 300, expired };
}

function notifier(delivered = true): FocusCompletionNotifier {
  return { notify: vi.fn().mockResolvedValue({ delivered, fallbackMessage: "阶段结束提示" }) };
}

describe("useFocusCompletionNotification", () => {
  beforeEach(() => localStorage.clear());

  it("notifies once when a work phase naturally expires", async () => {
    const api = notifier();
    const current = session();
    const { rerender } = renderHook(
      ({ state }) => useFocusCompletionNotification(current, state, api),
      { initialProps: { state: clock(false) } },
    );

    rerender({ state: clock(true) });
    await waitFor(() => expect(api.notify).toHaveBeenCalledWith("work"));
    rerender({ state: clock(true) });
    expect(api.notify).toHaveBeenCalledTimes(1);
  });

  it("notifies for an expired break and returns an in-app fallback message", async () => {
    const api = notifier(false);
    const breakSession = session({ phase: "break", phaseStartedAt: "2026-10-10T01:25:00Z" });
    const { result } = renderHook(() => useFocusCompletionNotification(breakSession, clock(true), api));

    await waitFor(() => expect(result.current).toBe("阶段结束提示"));
    expect(api.notify).toHaveBeenCalledWith("break");
  });

  it("does not repeat a notification after restoring an already handled phase", async () => {
    const current = session();
    const key = `${current.timer.id}:${current.phase}:${current.cycleNumber}:${current.phaseStartedAt}`;
    localStorage.setItem(FOCUS_NOTIFICATION_STORAGE_KEY, JSON.stringify([key]));
    const api = notifier();

    renderHook(() => useFocusCompletionNotification(current, clock(true), api));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(api.notify).not.toHaveBeenCalled();
  });

  it("ignores open timers, paused work and phases that have not expired", () => {
    const api = notifier();
    const { rerender } = renderHook(
      ({ current, state }) => useFocusCompletionNotification(current, state, api),
      { initialProps: { current: session({ mode: "open" }), state: clock(true) } },
    );
    rerender({ current: session({ timer: { ...session().timer, status: "paused", currentStartedAt: null } }), state: clock(true) });
    rerender({ current: session(), state: clock(false) });
    expect(api.notify).not.toHaveBeenCalled();
  });
});
