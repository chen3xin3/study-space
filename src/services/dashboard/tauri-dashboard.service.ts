import { invoke } from "@tauri-apps/api/core";
import type { CalendarDaySummary, CalendarMonthQuery, CreateDailyTaskInput, DailyTask, DashboardDayQuery, DashboardService, DashboardSummary, SetTaskCompletedInput, StudyTimer, VersionedIdInput } from "./dashboard.types";
export class TauriDashboardService implements DashboardService {
  getSummary(query: DashboardDayQuery) { return invoke<DashboardSummary>("get_dashboard_summary", { query }); }
  getCalendarMonth(query: CalendarMonthQuery) { return invoke<CalendarDaySummary[]>("get_calendar_month", { query }); }
  createTask(input: CreateDailyTaskInput) { return invoke<DailyTask>("create_daily_task", { input }); }
  setTaskCompleted(input: SetTaskCompletedInput) { return invoke<DailyTask>("set_daily_task_completed", { input }); }
  deleteTask(input: VersionedIdInput) { return invoke<void>("delete_daily_task", { input }); }
  startTimer(now: string) { return invoke<StudyTimer>("start_study_timer", { now }); }
  pauseTimer(input: VersionedIdInput, now: string) { return invoke<StudyTimer>("pause_study_timer", { input, now }); }
  resumeTimer(input: VersionedIdInput, now: string) { return invoke<StudyTimer>("resume_study_timer", { input, now }); }
  endTimer(input: VersionedIdInput, now: string) { return invoke<StudyTimer>("end_study_timer", { input, now }); }
}
