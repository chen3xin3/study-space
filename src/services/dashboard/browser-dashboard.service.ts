import type { CalendarDaySummary, CalendarMonthQuery, CreateDailyTaskInput, DailyTask, DashboardDayQuery, DashboardService, DashboardSummary, SetTaskCompletedInput, StudyTimer, VersionedIdInput } from "./dashboard.types";
type Segment = { start: string; end: string };
type State = { tasks: DailyTask[]; timers: StudyTimer[]; segments: Segment[] };
const KEY = "study-space-dashboard-v1";
const empty = (): State => ({ tasks: [], timers: [], segments: [] });
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const elapsed = (start: string, end: string) => Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));

export class BrowserDashboardService implements DashboardService {
  private read(): State { try { return JSON.parse(localStorage.getItem(KEY) ?? "null") ?? empty(); } catch { return empty(); } }
  private write(state: State) { localStorage.setItem(KEY, JSON.stringify(state)); }
  private settleFocus(state: State, now: string) {
    const timer = state.timers.find((item) => item.status === "running" && item.currentStartedAt);
    if (!timer?.currentStartedAt) return;
    const focusKey = "study-space-focus-v1";
    let sessions: Array<{ timerId: string; mode: string; phase: string; workSeconds: number; cycleStartSeconds: number; phaseStartedAt: string }>;
    try { sessions = JSON.parse(localStorage.getItem(focusKey) ?? "[]"); } catch { return; }
    const focus = sessions.find((item) => item.timerId === timer.id && item.mode === "pomodoro" && item.phase === "work");
    if (!focus) return;
    const remaining = Math.max(0, focus.workSeconds - (timer.accumulatedSeconds - focus.cycleStartSeconds));
    const deadline = new Date(Date.parse(timer.currentStartedAt) + remaining * 1000).toISOString();
    if (Date.parse(now) < Date.parse(deadline)) return;
    const seconds = elapsed(timer.currentStartedAt, deadline);
    state.segments.push({ start: timer.currentStartedAt, end: deadline });
    timer.accumulatedSeconds += seconds; timer.currentStartedAt = null; timer.status = "paused"; timer.updatedAt = deadline; timer.version++;
    focus.phase = "break"; focus.phaseStartedAt = deadline; focus.cycleStartSeconds = timer.accumulatedSeconds;
    this.write(state); localStorage.setItem(focusKey, JSON.stringify(sessions));
  }
  async getSummary(query: DashboardDayQuery): Promise<DashboardSummary> {
    const state = this.read(); const now = new Date().toISOString(); this.settleFocus(state, now); const timer = state.timers.find((item) => item.status !== "completed") ?? null;
    const segments = [...state.segments]; if (timer?.status === "running" && timer.currentStartedAt) segments.push({ start: timer.currentStartedAt, end: now });
    const trend = query.sevenDays.map((day) => ({ localDate: day.localDate, seconds: segments.reduce((sum, item) => { const start = Math.max(Date.parse(item.start), Date.parse(day.startUtc)); const end = Math.min(Date.parse(item.end), Date.parse(day.endUtc)); return sum + Math.max(0, Math.floor((end - start) / 1000)); }, 0) }));
    const tasks = state.tasks.filter((task) => task.localDate === query.localDate).sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || a.position - b.position);
    const days = [...trend].reverse(); if ((days[0]?.seconds ?? 0) < 60) days.shift(); const gap = days.findIndex((point) => point.seconds < 60);
    return { tasks, completedTasks: tasks.filter((task) => task.completedAt).length, totalTasks: tasks.length, todaySeconds: trend.find((point) => point.localDate === query.localDate)?.seconds ?? 0, timer, streakDays: gap < 0 ? days.length : gap, trend };
  }
  async getCalendarMonth(query: CalendarMonthQuery): Promise<CalendarDaySummary[]> {
    const state = this.read();
    const now = new Date().toISOString();
    this.settleFocus(state, now);
    const timer = state.timers.find((item) => item.status !== "completed") ?? null;
    const segments = [...state.segments];
    if (timer?.status === "running" && timer.currentStartedAt) segments.push({ start: timer.currentStartedAt, end: now });
    return query.days.map((day) => {
      const tasks = state.tasks.filter((task) => task.localDate === day.localDate);
      const studySeconds = segments.reduce((sum, item) => {
        const start = Math.max(Date.parse(item.start), Date.parse(day.startUtc));
        const end = Math.min(Date.parse(item.end), Date.parse(day.endUtc));
        return sum + Math.max(0, Math.floor((end - start) / 1000));
      }, 0);
      return {
        localDate: day.localDate,
        totalTasks: tasks.length,
        completedTasks: tasks.filter((task) => task.completedAt).length,
        studySeconds,
      };
    });
  }
  async createTask(input: CreateDailyTaskInput) { const title = input.title.trim(); if (!title) throw new Error("请输入待办内容"); const state = this.read(); const now = new Date().toISOString(); const task: DailyTask = { id: uid(), localDate: input.localDate, title, learningItemId: input.learningItemId ?? null, position: state.tasks.filter((item) => item.localDate === input.localDate).length, completedAt: null, createdAt: now, updatedAt: now, version: 1 }; state.tasks.push(task); this.write(state); return task; }
  async setTaskCompleted(input: SetTaskCompletedInput) { const state = this.read(); const task = state.tasks.find((item) => item.id === input.id && item.version === input.version); if (!task) throw new Error("待办已发生变化，请重试"); task.completedAt = input.completed ? new Date().toISOString() : null; task.updatedAt = new Date().toISOString(); task.version++; this.write(state); return task; }
  async deleteTask(input: VersionedIdInput) { const state = this.read(); const index = state.tasks.findIndex((item) => item.id === input.id && item.version === input.version); if (index < 0) throw new Error("待办已发生变化，请重试"); state.tasks.splice(index, 1); this.write(state); }
  async startTimer(now: string) { const state = this.read(); if (state.timers.some((item) => item.status !== "completed")) throw new Error("已有学习计时正在进行"); const timer: StudyTimer = { id: uid(), status: "running", currentStartedAt: now, accumulatedSeconds: 0, endedAt: null, createdAt: now, updatedAt: now, version: 1 }; state.timers.push(timer); this.write(state); return timer; }
  async pauseTimer(input: VersionedIdInput, now: string) { return this.transition(input, now, "paused"); }
  async resumeTimer(input: VersionedIdInput, now: string) { const state = this.read(); const timer = state.timers.find((item) => item.id === input.id && item.version === input.version && item.status === "paused"); if (!timer) throw new Error("计时状态已变化"); const focus = JSON.parse(localStorage.getItem("study-space-focus-v1") ?? "[]").find((item: { timerId: string }) => item.timerId === timer.id); if (focus?.phase === "break") throw new Error("请在专注空间开始下一轮"); timer.status = "running"; timer.currentStartedAt = now; timer.updatedAt = now; timer.version++; this.write(state); return timer; }
  async endTimer(input: VersionedIdInput, now: string) { return this.transition(input, now, "completed"); }
  private async transition(input: VersionedIdInput, now: string, target: "paused" | "completed") { const state = this.read(); const timer = state.timers.find((item) => item.id === input.id && item.version === input.version); if (!timer || timer.status === "completed") throw new Error("计时状态已变化"); if (timer.status === "running" && timer.currentStartedAt) { if (Date.parse(now) < Date.parse(timer.currentStartedAt)) throw new Error("系统时间异常"); timer.accumulatedSeconds += elapsed(timer.currentStartedAt, now); state.segments.push({ start: timer.currentStartedAt, end: now }); } timer.status = target; timer.currentStartedAt = null; timer.endedAt = target === "completed" ? now : null; timer.updatedAt = now; timer.version++; this.write(state); return timer; }
}
