export type FocusStatus = "running" | "paused" | "break" | "finished";
export type FocusSession = {
  task: string;
  status: FocusStatus;
  accumulatedWorkMs: number;
  activeSince: number | null;
  interruptions: { reason: string; at: number }[];
  review: { rating: number; note: string } | null;
};

export function startSession(task: string, now = Date.now()): FocusSession {
  return { task: task.trim() || "自由学习", status: "running", accumulatedWorkMs: 0, activeSince: now, interruptions: [], review: null };
}

export function elapsedWorkMs(session: FocusSession, now = Date.now()): number {
  return session.accumulatedWorkMs + (session.status === "running" && session.activeSince !== null ? Math.max(0, now - session.activeSince) : 0);
}

function stopRunningClock(session: FocusSession, now: number): number {
  return elapsedWorkMs(session, now);
}

export function pauseSession(session: FocusSession, now = Date.now()): FocusSession {
  if (session.status !== "running") return session;
  return { ...session, status: "paused", accumulatedWorkMs: stopRunningClock(session, now), activeSince: null };
}

export function resumeSession(session: FocusSession, now = Date.now()): FocusSession {
  if (session.status === "running" || session.status === "finished") return session;
  return { ...session, status: "running", activeSince: now };
}

export function startBreak(session: FocusSession, now = Date.now()): FocusSession {
  if (session.status === "finished") return session;
  return { ...session, status: "break", accumulatedWorkMs: stopRunningClock(session, now), activeSince: null };
}

export function recordInterruption(session: FocusSession, reason: string, now = Date.now()): FocusSession {
  return { ...session, interruptions: [...session.interruptions, { reason: reason.trim() || "未说明", at: now }] };
}

export function finishSession(session: FocusSession, now: number, rating: number, note: string): FocusSession {
  return { ...session, status: "finished", accumulatedWorkMs: stopRunningClock(session, now), activeSince: null, review: { rating, note: note.trim() } };
}
