import type { StudyTimer, VersionedIdInput } from "../dashboard/dashboard.types";

export type FocusMode = "open" | "pomodoro";
export type FocusSubject = "english" | "math" | "specialty" | "politics" | "other";
export type FocusRepeatRule = "none" | "daily" | "weekdays" | "weekly";
export type FocusInterruptionReason = "phone" | "urgent" | "environment" | "physical" | "other";

export interface StartFocusInput {
  mode: FocusMode;
  subject: FocusSubject;
  goal: string;
  workSeconds: number;
  breakSeconds: number;
  longBreakSeconds: number;
  cyclesPerSet: number;
  longBreakAfterCycles: number;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  planId: string | null;
  presetId: string | null;
  learningItemId?: string | null;
  dailyTaskId?: string | null;
}

export interface FocusSession extends Omit<StartFocusInput, "learningItemId" | "dailyTaskId"> {
  learningItemId?: string | null;
  dailyTaskId?: string | null;
  timer: StudyTimer;
  phase: "work" | "break";
  phaseStartedAt: string;
  cycleNumber: number;
  cycleStartSeconds: number;
}

export interface FocusHistoryItem { timerId: string; startedAt: string; endedAt: string; studySeconds: number; mode: FocusMode; subject: FocusSubject; goal: string; learningItemId: string | null; dailyTaskId: string | null }
export interface PhaseInput { timerId: string; phase: "work" | "break"; cycleNumber: number; cycleStartSeconds: number }

export interface FocusPlan {
  id: string;
  localDate: string;
  title: string;
  subject: FocusSubject;
  estimatedCycles: number;
  completedCycles: number;
  repeatRule: FocusRepeatRule;
  linkedDailyTaskId: string | null;
  learningItemId?: string | null;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateFocusPlanInput { localDate: string; title: string; subject: FocusSubject; estimatedCycles: number; repeatRule: FocusRepeatRule; linkedDailyTaskId: string | null; learningItemId?: string | null }
export interface UpdateFocusPlanInput extends CreateFocusPlanInput { id: string; version: number }
export interface SetFocusPlanCompletedInput extends VersionedIdInput { completed: boolean }

export interface FocusPreset {
  id: string;
  name: string;
  mode: FocusMode;
  workSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  cyclesPerSet: number;
  longBreakAfterCycles: number;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type CreateFocusPresetInput = Omit<FocusPreset, "id" | "createdAt" | "updatedAt" | "version">;
export type UpdateFocusPresetInput = CreateFocusPresetInput & VersionedIdInput;

export interface FocusInterruption { id: string; timerId: string; reason: FocusInterruptionReason; note: string; elapsedSeconds: number; createdAt: string }
export interface AddInterruptionInput { timerId: string; reason: FocusInterruptionReason; note: string; elapsedSeconds: number }
export interface FocusReview { timerId: string; planCompleted: boolean; completedCycles: number; focusRating: number; note: string; createdAt: string }
export interface CompleteFocusReviewInput { timerId: string; timerVersion: number; planCompleted: boolean; completedCycles: number; focusRating: number; note: string }
export interface FocusSessionDetail { timer: StudyTimer; review: FocusReview; interruptions: FocusInterruption[] }

export interface FocusPlanService {
  list(localDate: string): Promise<FocusPlan[]>;
  create(input: CreateFocusPlanInput): Promise<FocusPlan>;
  update(input: UpdateFocusPlanInput): Promise<FocusPlan>;
  setCompleted(input: SetFocusPlanCompletedInput): Promise<FocusPlan>;
  delete(input: VersionedIdInput): Promise<void>;
  reorder(localDate: string, orderedIds: string[]): Promise<FocusPlan[]>;
}

export interface FocusService {
  start(input: StartFocusInput): Promise<FocusSession>;
  getActive(): Promise<FocusSession | null>;
  setPhase(input: PhaseInput): Promise<void>;
  listPresets(): Promise<FocusPreset[]>;
  createPreset(input: CreateFocusPresetInput): Promise<FocusPreset>;
  updatePreset(input: UpdateFocusPresetInput): Promise<FocusPreset>;
  deletePreset(input: VersionedIdInput): Promise<void>;
  addInterruption(input: AddInterruptionInput): Promise<FocusInterruption>;
  listInterruptions(timerId: string): Promise<FocusInterruption[]>;
  completeReview(input: CompleteFocusReviewInput): Promise<FocusSessionDetail>;
  getSessionDetail(timerId: string): Promise<FocusSessionDetail>;
  listHistory(offset?: number): Promise<FocusHistoryItem[]>;
}
