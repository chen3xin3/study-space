import { useEffect, useState } from "react";
import type { FocusSession } from "../../services/focus/focus.types";
import type { FocusCompletionNotifier } from "../../services/notifications/focus-completion-notifier";
import type { FocusClockState } from "./useFocusClock";

export const FOCUS_NOTIFICATION_STORAGE_KEY = "study-space.focus-completion-notifications.v1";
const memoryKeys = new Set<string>();

function readKeys(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOCUS_NOTIFICATION_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch { return [...memoryKeys]; }
}

function rememberKey(key: string): void {
  memoryKeys.add(key);
  try {
    const next = [...new Set([...readKeys(), key])].slice(-32);
    localStorage.setItem(FOCUS_NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
  } catch { /* The in-memory set still prevents duplicates this session. */ }
}

export function useFocusCompletionNotification(
  session: FocusSession | null,
  clock: FocusClockState | null,
  notifier: FocusCompletionNotifier,
): string {
  const [fallbackMessage, setFallbackMessage] = useState("");

  useEffect(() => {
    if (!session || !clock?.expired || session.mode !== "pomodoro") return;
    if (session.phase === "work" && session.timer.status !== "running") return;
    const key = `${session.timer.id}:${session.phase}:${session.cycleNumber}:${session.phaseStartedAt}`;
    if (memoryKeys.has(key) || readKeys().includes(key)) return;
    rememberKey(key);
    let active = true;
    void notifier.notify(session.phase).then((result) => {
      if (active && !result.delivered) setFallbackMessage(result.fallbackMessage);
    });
    return () => { active = false; };
  }, [clock?.expired, notifier, session]);

  return fallbackMessage;
}
