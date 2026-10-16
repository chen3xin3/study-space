import { expect, it } from "vitest";
import type { FocusSession } from "../../services/focus/focus.types";
import { calculateFocusClock } from "./useFocusClock";

const session = (overrides: Partial<FocusSession> = {}): FocusSession => ({
  mode: "pomodoro", subject: "english", goal: "精读", workSeconds: 1500,
  breakSeconds: 300, longBreakSeconds: 900, cyclesPerSet: 4,
  longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false,
  planId: null, presetId: "builtin-25-5", phase: "work",
  phaseStartedAt: "2026-10-02T01:00:00Z", cycleNumber: 1, cycleStartSeconds: 0,
  timer: { id: "timer-1", status: "running", currentStartedAt: "2026-10-02T01:00:00Z", accumulatedSeconds: 0, endedAt: null, createdAt: "2026-10-02T01:00:00Z", updatedAt: "2026-10-02T01:00:00Z", version: 1 },
  ...overrides,
});

it("calculates work countdown from persisted timer timestamps", () => {
  const clock = calculateFocusClock(session(), Date.parse("2026-10-02T01:10:00Z"));
  expect(clock.elapsed).toBe(600);
  expect(clock.remaining).toBe(900);
  expect(clock.progress).toBe(40);
  expect(clock.expired).toBe(false);
});

it("uses the long break duration on the configured cycle", () => {
  const clock = calculateFocusClock(session({ phase: "break", cycleNumber: 4, timer: { ...session().timer, status: "paused", currentStartedAt: null, accumulatedSeconds: 600 }, phaseStartedAt: "2026-10-02T01:10:00Z" }), Date.parse("2026-10-02T01:15:00Z"));
  expect(clock.activeBreakSeconds).toBe(900);
  expect(clock.remaining).toBe(600);
  expect(clock.progress).toBe(33);
});

it("never adds running wall time to effective study time during a break", () => {
  const clock = calculateFocusClock(session({
    phase: "break",
    phaseStartedAt: "2026-10-02T01:10:00Z",
    timer: { ...session().timer, status: "running", currentStartedAt: "2026-10-02T01:10:00Z", accumulatedSeconds: 600 },
  }), Date.parse("2026-10-02T01:15:00Z"));
  expect(clock.elapsed).toBe(600);
  expect(clock.phaseElapsed).toBe(300);
});

it("keeps open mode as an elapsed timer", () => {
  const clock = calculateFocusClock(session({ mode: "open", workSeconds: 3600 }), Date.parse("2026-10-02T01:02:00Z"));
  expect(clock.remaining).toBe(120);
  expect(clock.progress).toBe(0);
});
