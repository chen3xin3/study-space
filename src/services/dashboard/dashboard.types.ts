export interface DailyTask { id: string; localDate: string; title: string; learningItemId?: string | null; position: number; completedAt: string | null; createdAt: string; updatedAt: string; version: number }
export type StudyTimerStatus = "running" | "paused" | "completed";
export interface StudyTimer { id: string; status: StudyTimerStatus; currentStartedAt: string | null; accumulatedSeconds: number; endedAt: string | null; createdAt: string; updatedAt: string; version: number }
export interface DailyWindow { localDate: string; startUtc: string; endUtc: string }
export interface CalendarMonthQuery { days: DailyWindow[] }
export interface CalendarDaySummary { localDate: string; totalTasks: number; completedTasks: number; studySeconds: number }
export interface DailyStudyPoint { localDate: string; seconds: number }
export interface DashboardDayQuery { localDate: string; dayStartUtc: string; dayEndUtc: string; sevenDays: DailyWindow[] }
export interface CreateDailyTaskInput { localDate: string; title: string; learningItemId?: string | null }
export interface VersionedIdInput { id: string; version: number }
export interface SetTaskCompletedInput extends VersionedIdInput { completed: boolean }
export interface DashboardSummary { tasks: DailyTask[]; completedTasks: number; totalTasks: number; todaySeconds: number; timer: StudyTimer | null; streakDays: number; trend: DailyStudyPoint[] }
export interface DashboardService {
  getSummary(query: DashboardDayQuery): Promise<DashboardSummary>;
  getCalendarMonth(query: CalendarMonthQuery): Promise<CalendarDaySummary[]>;
  createTask(input: CreateDailyTaskInput): Promise<DailyTask>;
  setTaskCompleted(input: SetTaskCompletedInput): Promise<DailyTask>;
  deleteTask(input: VersionedIdInput): Promise<void>;
  startTimer(now: string): Promise<StudyTimer>;
  pauseTimer(input: VersionedIdInput, now: string): Promise<StudyTimer>;
  resumeTimer(input: VersionedIdInput, now: string): Promise<StudyTimer>;
  endTimer(input: VersionedIdInput, now: string): Promise<StudyTimer>;
}
