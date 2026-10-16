import { BrowserDashboardService } from "../dashboard/browser-dashboard.service";
import type { DailyTask, StudyTimer, VersionedIdInput } from "../dashboard/dashboard.types";
import { createDashboardDayQuery } from "../../utils/dashboard-calendar";
import { focusUid, readFocusState, writeFocusState, type StoredFocusSession } from "./browser-focus.store";
import type { AddInterruptionInput, CompleteFocusReviewInput, CreateFocusPresetInput, FocusHistoryItem, FocusInterruption, FocusPreset, FocusService, FocusSession, FocusSessionDetail, PhaseInput, StartFocusInput, UpdateFocusPresetInput } from "./focus.types";

const validSettings = (input: Pick<StartFocusInput, "workSeconds" | "breakSeconds" | "longBreakSeconds" | "cyclesPerSet" | "longBreakAfterCycles">) => input.workSeconds >= 60 && input.workSeconds <= 14400 && input.breakSeconds >= 0 && input.breakSeconds <= 3600 && input.longBreakSeconds >= 0 && input.longBreakSeconds <= 7200 && input.cyclesPerSet >= 1 && input.cyclesPerSet <= 12 && input.longBreakAfterCycles >= 1 && input.longBreakAfterCycles <= input.cyclesPerSet;
const dashboardTimers = (): StudyTimer[] => { try { return JSON.parse(localStorage.getItem("study-space-dashboard-v1") ?? "{}")?.timers ?? []; } catch { return []; } };
const dashboardTasks = (): DailyTask[] => { try { return JSON.parse(localStorage.getItem("study-space-dashboard-v1") ?? "{}")?.tasks ?? []; } catch { return []; } };

export class BrowserFocusService implements FocusService {
  private dashboard = new BrowserDashboardService();

  async start(input: StartFocusInput): Promise<FocusSession> {
    const state = readFocusState();
    if (input.goal.length > 120 || !validSettings(input)) throw new Error("专注设置不正确");
    if (input.planId && !state.plans.some((item) => item.id === input.planId)) throw new Error("专注任务不存在");
    if (input.presetId && !state.presets.some((item) => item.id === input.presetId)) throw new Error("专注方案不存在");
    if (input.dailyTaskId && !dashboardTasks().some((item) => item.id === input.dailyTaskId)) throw new Error("今日任务不存在");
    const now = new Date().toISOString(); const timer = await this.dashboard.startTimer(now);
    const stored: StoredFocusSession = { ...input, learningItemId: input.learningItemId ?? null, dailyTaskId: input.dailyTaskId ?? null, timerId: timer.id, phase: "work", phaseStartedAt: now, cycleNumber: 1, cycleStartSeconds: 0 };
    state.sessions.unshift(stored); writeFocusState(state);
    return { ...stored, timer };
  }

  async getActive(): Promise<FocusSession | null> {
    const timer = (await this.dashboard.getSummary(createDashboardDayQuery())).timer;
    if (!timer) return null;
    const item = readFocusState().sessions.find((entry) => entry.timerId === timer.id);
    if (item) return { ...item, timer };
    return { timer, mode: "open", subject: "other", goal: "", workSeconds: 1500, breakSeconds: 0, longBreakSeconds: 900, cyclesPerSet: 4, longBreakAfterCycles: 4, autoStartBreak: false, autoStartWork: false, planId: null, presetId: null, learningItemId: null, dailyTaskId: null, phase: "work", phaseStartedAt: timer.createdAt, cycleNumber: 1, cycleStartSeconds: 0 };
  }

  async setPhase(input: PhaseInput): Promise<void> {
    const state = readFocusState(); const item = state.sessions.find((entry) => entry.timerId === input.timerId);
    if (!item) throw new Error("专注记录不存在");
    Object.assign(item, { phase: input.phase, phaseStartedAt: new Date().toISOString(), cycleNumber: input.cycleNumber, cycleStartSeconds: input.cycleStartSeconds });
    writeFocusState(state);
  }

  async listPresets(): Promise<FocusPreset[]> { return readFocusState().presets; }

  async createPreset(input: CreateFocusPresetInput): Promise<FocusPreset> {
    if (!input.name.trim() || !validSettings({ ...input, breakSeconds: input.shortBreakSeconds })) throw new Error("专注方案设置不正确");
    const state = readFocusState(); const now = new Date().toISOString();
    const preset: FocusPreset = { ...input, name: input.name.trim(), id: focusUid(), createdAt: now, updatedAt: now, version: 1 };
    state.presets.push(preset); writeFocusState(state); return preset;
  }

  async updatePreset(input: UpdateFocusPresetInput): Promise<FocusPreset> {
    if (input.id.startsWith("builtin-")) throw new Error("内置方案不能修改");
    const state = readFocusState(); const preset = state.presets.find((item) => item.id === input.id && item.version === input.version);
    if (!preset) throw new Error("专注方案已发生变化，请重试");
    Object.assign(preset, input, { name: input.name.trim(), updatedAt: new Date().toISOString(), version: preset.version + 1 });
    writeFocusState(state); return preset;
  }

  async deletePreset(input: VersionedIdInput): Promise<void> {
    if (input.id.startsWith("builtin-")) throw new Error("内置方案不能删除");
    const state = readFocusState(); const index = state.presets.findIndex((item) => item.id === input.id && item.version === input.version);
    if (index < 0) throw new Error("专注方案已发生变化，请重试");
    state.presets.splice(index, 1); writeFocusState(state);
  }

  async addInterruption(input: AddInterruptionInput): Promise<FocusInterruption> {
    if (!(["phone", "urgent", "environment", "physical", "other"] as string[]).includes(input.reason) || input.note.length > 120 || input.elapsedSeconds < 0) throw new Error("中断记录不正确");
    const state = readFocusState();
    if (!state.sessions.some((item) => item.timerId === input.timerId)) throw new Error("专注记录不存在");
    const interruption: FocusInterruption = { ...input, note: input.note.trim(), id: focusUid(), createdAt: new Date().toISOString() };
    state.interruptions.push(interruption); writeFocusState(state); return interruption;
  }

  async listInterruptions(timerId: string): Promise<FocusInterruption[]> {
    return readFocusState().interruptions.filter((item) => item.timerId === timerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async completeReview(input: CompleteFocusReviewInput): Promise<FocusSessionDetail> {
    if (input.focusRating < 1 || input.focusRating > 5 || input.completedCycles < 0 || input.note.length > 300) throw new Error("复盘内容不正确");
    const state = readFocusState(); const session = state.sessions.find((item) => item.timerId === input.timerId);
    if (!session) throw new Error("专注记录不存在");
    const now = new Date().toISOString(); const timer = await this.dashboard.endTimer({ id: input.timerId, version: input.timerVersion }, now);
    const review = { timerId: input.timerId, planCompleted: input.planCompleted, completedCycles: input.completedCycles, focusRating: input.focusRating, note: input.note.trim(), createdAt: now };
    state.reviews.push(review);
    if (session.planId) {
      const plan = state.plans.find((item) => item.id === session.planId);
      if (plan) { plan.completedCycles += input.completedCycles; plan.completedAt = input.planCompleted ? (plan.completedAt ?? now) : plan.completedAt; plan.updatedAt = now; plan.version++; }
    }
    if (input.planCompleted && session.dailyTaskId) {
      const task = dashboardTasks().find((item) => item.id === session.dailyTaskId);
      if (task && !task.completedAt) await this.dashboard.setTaskCompleted({ id: task.id, version: task.version, completed: true });
    }
    writeFocusState(state);
    return { timer, review, interruptions: state.interruptions.filter((item) => item.timerId === input.timerId) };
  }

  async getSessionDetail(timerId: string): Promise<FocusSessionDetail> {
    const state = readFocusState(); const review = state.reviews.find((item) => item.timerId === timerId); const timer = dashboardTimers().find((item) => item.id === timerId);
    if (!review || !timer) throw new Error("复盘记录不存在");
    return { timer, review, interruptions: state.interruptions.filter((item) => item.timerId === timerId) };
  }

  async listHistory(offset = 0): Promise<FocusHistoryItem[]> {
    const sessions = readFocusState().sessions;
    return dashboardTimers().filter((timer) => timer.status === "completed" && timer.endedAt).reverse().slice(offset, offset + 30).map((timer) => {
      const item = sessions.find((entry) => entry.timerId === timer.id);
      return { timerId: timer.id, startedAt: timer.createdAt, endedAt: timer.endedAt!, studySeconds: timer.accumulatedSeconds, mode: item?.mode ?? "open", subject: item?.subject ?? "other", goal: item?.goal ?? "", learningItemId: item?.learningItemId ?? null, dailyTaskId: item?.dailyTaskId ?? null };
    });
  }
}
