import { useEffect, useMemo, useState } from "react";
import type { FocusSession } from "../../services/focus/focus.types";

export interface FocusClockState {
  elapsed: number;
  phaseElapsed: number;
  remaining: number;
  progress: number;
  activeBreakSeconds: number;
  expired: boolean;
}

export function calculateFocusClock(session: FocusSession, now: number): FocusClockState {
  const runningSeconds = session.phase !== "break" && session.timer.status === "running" && session.timer.currentStartedAt
    ? Math.max(0, Math.floor((now - Date.parse(session.timer.currentStartedAt)) / 1000))
    : 0;
  const elapsed = session.timer.accumulatedSeconds + runningSeconds;
  const activeBreakSeconds = session.cycleNumber % session.longBreakAfterCycles === 0
    ? session.longBreakSeconds
    : session.breakSeconds;
  if (session.mode === "open") return { elapsed, phaseElapsed: elapsed, remaining: elapsed, progress: 0, activeBreakSeconds, expired: false };
  const phaseElapsed = session.phase === "break"
    ? Math.max(0, Math.floor((now - Date.parse(session.phaseStartedAt)) / 1000))
    : Math.max(0, elapsed - session.cycleStartSeconds);
  const phaseSeconds = session.phase === "break" ? activeBreakSeconds : session.workSeconds;
  const remaining = Math.max(0, phaseSeconds - phaseElapsed);
  return {
    elapsed,
    phaseElapsed,
    remaining,
    progress: Math.min(100, Math.round(phaseElapsed / Math.max(1, phaseSeconds) * 100)),
    activeBreakSeconds,
    expired: remaining === 0,
  };
}

export function useFocusClock(session: FocusSession | null): FocusClockState | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => session ? calculateFocusClock(session, now) : null, [session, now]);
}
