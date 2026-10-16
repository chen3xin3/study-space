import type { FocusInterruption, FocusPlan, FocusPreset, FocusReview, FocusSession } from "./focus.types";

export const FOCUS_V2_KEY = "study-space-focus-system-v2";
export const LEGACY_FOCUS_KEY = "study-space-focus-v1";

export type StoredFocusSession = Omit<FocusSession, "timer"> & { timerId: string };
export interface BrowserFocusState {
  version: 2;
  sessions: StoredFocusSession[];
  plans: FocusPlan[];
  presets: FocusPreset[];
  interruptions: FocusInterruption[];
  reviews: FocusReview[];
}

const createdAt = "2026-10-02T00:00:00Z";
const builtinPresets: FocusPreset[] = [
  { id: "builtin-25-5", name: "经典番茄", mode: "pomodoro", workSeconds: 1500, shortBreakSeconds: 300, longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false, createdAt, updatedAt: createdAt, version: 1 },
  { id: "builtin-50-10", name: "深度学习", mode: "pomodoro", workSeconds: 3000, shortBreakSeconds: 600, longBreakSeconds: 1200, cyclesPerSet: 4, longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false, createdAt, updatedAt: createdAt, version: 1 },
  { id: "builtin-90-20", name: "沉浸长时段", mode: "pomodoro", workSeconds: 5400, shortBreakSeconds: 1200, longBreakSeconds: 1800, cyclesPerSet: 2, longBreakAfterCycles: 2, autoStartBreak: false, autoStartWork: false, createdAt, updatedAt: createdAt, version: 1 },
];

const empty = (): BrowserFocusState => ({ version: 2, sessions: [], plans: [], presets: structuredClone(builtinPresets), interruptions: [], reviews: [] });

function normalizeSession(value: Partial<StoredFocusSession> & { timerId: string }): StoredFocusSession {
  return {
    timerId: value.timerId,
    mode: value.mode ?? "open",
    subject: value.subject ?? "other",
    goal: value.goal ?? "",
    workSeconds: value.workSeconds ?? 1500,
    breakSeconds: value.breakSeconds ?? 0,
    longBreakSeconds: value.longBreakSeconds ?? 900,
    cyclesPerSet: value.cyclesPerSet ?? 4,
    longBreakAfterCycles: value.longBreakAfterCycles ?? 4,
    autoStartBreak: value.autoStartBreak ?? false,
    autoStartWork: value.autoStartWork ?? false,
    planId: value.planId ?? null,
    presetId: value.presetId ?? null,
    learningItemId: value.learningItemId ?? null,
    dailyTaskId: value.dailyTaskId ?? null,
    phase: value.phase ?? "work",
    phaseStartedAt: value.phaseStartedAt ?? new Date().toISOString(),
    cycleNumber: value.cycleNumber ?? 1,
    cycleStartSeconds: value.cycleStartSeconds ?? 0,
  };
}

export function writeFocusState(state: BrowserFocusState): void {
  localStorage.setItem(FOCUS_V2_KEY, JSON.stringify(state));
  localStorage.setItem(LEGACY_FOCUS_KEY, JSON.stringify(state.sessions));
}

export function readFocusState(): BrowserFocusState {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOCUS_V2_KEY) ?? "null") as BrowserFocusState | null;
    if (parsed?.version === 2) {
      parsed.sessions = (parsed.sessions ?? []).map(normalizeSession);
      parsed.plans ??= [];
      parsed.presets = parsed.presets?.length ? parsed.presets : structuredClone(builtinPresets);
      parsed.interruptions ??= [];
      parsed.reviews ??= [];
      return parsed;
    }
  } catch { /* migrate below */ }
  const state = empty();
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_FOCUS_KEY) ?? "[]") as Array<Partial<StoredFocusSession> & { timerId: string }>;
    state.sessions = Array.isArray(legacy) ? legacy.filter((item) => typeof item?.timerId === "string").map(normalizeSession) : [];
  } catch { /* keep empty */ }
  writeFocusState(state);
  return state;
}

export const focusUid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
