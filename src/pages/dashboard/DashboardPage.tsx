import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { CalendarDayDrawer } from "../../components/dashboard/CalendarDayDrawer";
import { CalendarMonthCard } from "../../components/dashboard/CalendarMonthCard";
import { DashboardCockpit } from "../../components/dashboard/DashboardCockpit";
import { DailyTaskList } from "../../components/dashboard/DailyTaskList";
import { StudyGrowthPanel } from "../../components/dashboard/StudyGrowthPanel";
import { TodayReviewCard } from "../../components/dashboard/TodayReviewCard";
import { Card } from "../../components/ui/Card";
import { createDashboardService } from "../../services/dashboard/dashboard.service";
import type { CalendarDaySummary, DailyTask, DashboardService, DashboardSummary } from "../../services/dashboard/dashboard.types";
import { createReviewQueueService } from "../../services/review-queue/review-queue.service";
import type { ReviewQueueService, ReviewQueueSummary } from "../../services/review-queue/review-queue.types";
import { useSettings } from "../../services/settings/SettingsProvider";
import { createCalendarGrid, createCalendarMonthQuery, createDashboardDayQuery, localDateKey } from "../../utils/dashboard-calendar";
import "./dashboard-cockpit.css";

export { createDashboardDayQuery } from "../../utils/dashboard-calendar";

interface VisibleMonth { year: number; monthIndex: number }
const currentMonth = (): VisibleMonth => ({ year: new Date().getFullYear(), monthIndex: new Date().getMonth() });

export function DashboardPage({ service: suppliedService, reviewQueueService: suppliedReviewQueue }: { service?: DashboardService; reviewQueueService?: ReviewQueueService }) {
  const { settings } = useSettings();
  const [service] = useState(() => suppliedService ?? createDashboardService());
  const [reviewQueueService] = useState(() => suppliedReviewQueue ?? createReviewQueueService());
  const [query, setQuery] = useState(() => createDashboardDayQuery());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const summaryRequestRef = useRef(0);
  const reviewRequestRef = useRef(0);
  const [reviewSummary, setReviewSummary] = useState<ReviewQueueSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(currentMonth);
  const visibleMonthRef = useRef(visibleMonth);
  const monthRequestRef = useRef(0);
  const dayRequestRef = useRef(0);
  const selectedDateRef = useRef("");
  const [monthSummaries, setMonthSummaries] = useState<CalendarDaySummary[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<DashboardSummary | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { visibleMonthRef.current = visibleMonth; }, [visibleMonth]);
  const calendarGrid = useMemo(() => createCalendarGrid(visibleMonth.year, visibleMonth.monthIndex), [visibleMonth]);

  const loadReview = useCallback(async (tasks: DailyTask[]) => {
    const requestId = ++reviewRequestRef.current;
    setReviewLoading(true);
    try {
      const result = await reviewQueueService.load({ now: new Date(`${query.localDate}T12:00:00`), tasks });
      if (requestId === reviewRequestRef.current) setReviewSummary(result);
    } finally {
      if (requestId === reviewRequestRef.current) setReviewLoading(false);
    }
  }, [query.localDate, reviewQueueService]);

  const loadSummary = useCallback(async () => {
    const requestId = ++summaryRequestRef.current;
    try {
      const result = await service.getSummary(query);
      if (requestId !== summaryRequestRef.current) return;
      setSummary(result);
      setError("");
      void loadReview(result.tasks);
    } catch (caught) {
      if (requestId !== summaryRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : "首页数据读取失败，请重试");
    }
  }, [loadReview, query, service]);

  const loadMonth = useCallback(async () => {
    const requestId = ++monthRequestRef.current;
    setMonthLoading(true);
    try {
      const result = await service.getCalendarMonth(createCalendarMonthQuery(visibleMonth.year, visibleMonth.monthIndex));
      if (requestId !== monthRequestRef.current) return;
      setMonthSummaries(result);
      setMonthError("");
    } catch (caught) {
      if (requestId !== monthRequestRef.current) return;
      setMonthError(caught instanceof Error ? caught.message : "本月记录读取失败，请重试");
    } finally { if (requestId === monthRequestRef.current) setMonthLoading(false); }
  }, [service, visibleMonth]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadMonth(); }, [loadMonth]);

  useEffect(() => {
    let timer = 0;
    const scheduleNextDay = () => {
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(() => {
        const oldDate = new Date(`${query.localDate}T12:00:00`);
        setQuery(createDashboardDayQuery());
        const shown = visibleMonthRef.current;
        if (shown.year === oldDate.getFullYear() && shown.monthIndex === oldDate.getMonth()) setVisibleMonth(currentMonth());
        scheduleNextDay();
      }, Math.max(1, nextDay.getTime() - now.getTime() + 50));
    };
    scheduleNextDay();
    return () => window.clearTimeout(timer);
  }, [query.localDate]);

  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await operation();
      await Promise.all([loadSummary(), loadMonth()]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "操作失败，请重试";
      try { await loadSummary(); } catch { /* Keep the last readable summary. */ }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const loadSelectedDay = useCallback(async (localDate: string) => {
    const requestId = ++dayRequestRef.current;
    setSelectedSummary(null);
    setDrawerError("");
    setDrawerLoading(true);
    try {
      const result = await service.getSummary(createDashboardDayQuery(new Date(`${localDate}T12:00:00`)));
      if (requestId !== dayRequestRef.current || selectedDateRef.current !== localDate) return;
      setSelectedSummary(result);
    } catch (caught) {
      if (requestId !== dayRequestRef.current || selectedDateRef.current !== localDate) return;
      setDrawerError(caught instanceof Error ? caught.message : "当天记录读取失败，请重试");
    } finally { if (requestId === dayRequestRef.current) setDrawerLoading(false); }
  }, [service]);

  const openDay = (localDate: string, trigger: HTMLButtonElement) => {
    selectedTriggerRef.current = trigger;
    selectedDateRef.current = localDate;
    setSelectedDate(localDate);
    setDrawerOpen(true);
    void loadSelectedDay(localDate);
  };

  const performSelected = async (operation: () => Promise<unknown>) => {
    if (!selectedDate) return;
    const operationDate = selectedDate;
    setBusy(true);
    try {
      try {
        await operation();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "操作失败，请重试";
        const selectedQuery = createDashboardDayQuery(new Date(`${operationDate}T12:00:00`));
        const [day] = await Promise.allSettled([service.getSummary(selectedQuery), loadMonth()]);
        if (selectedDateRef.current === operationDate) {
          if (day.status === "fulfilled") setSelectedSummary(day.value);
          setDrawerError("");
        }
        throw caught instanceof Error ? caught : new Error(message);
      }

      const selectedQuery = createDashboardDayQuery(new Date(`${operationDate}T12:00:00`));
      const [day] = await Promise.allSettled([service.getSummary(selectedQuery), loadMonth(), operationDate === query.localDate ? loadSummary() : Promise.resolve()]);
      if (selectedDateRef.current === operationDate) {
        if (day.status === "fulfilled") { setSelectedSummary(day.value); setDrawerError(""); }
        else setDrawerError("待办已保存，但当天记录刷新失败，请重新加载");
      }
    } finally { setBusy(false); }
  };

  const shiftMonth = (offset: number) => setVisibleMonth((month) => {
    const next = new Date(month.year, month.monthIndex + offset, 1);
    return { year: next.getFullYear(), monthIndex: next.getMonth() };
  });
  const closeDrawer = useCallback(() => { setDrawerOpen(false); dayRequestRef.current += 1; setDrawerLoading(false); }, []);

  return (
    <main className="page dashboard-page dashboard-page--cockpit">
      <DashboardCockpit completedTasks={summary?.completedTasks} totalTasks={summary?.totalTasks} todaySeconds={summary?.todaySeconds} streakDays={summary?.streakDays} />
      {error ? <Card className="dashboard-error" role="alert"><AlertCircle size={20} /><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadSummary()}><RefreshCw size={15} />重新加载</button></Card> : null}
      <section className="dashboard-main-grid" aria-label="今日待办与学习日历">
        {summary ? <DailyTaskList tasks={summary.tasks} busy={busy} onCreate={(title) => perform(() => service.createTask({ localDate: query.localDate, title }))} onToggle={(task: DailyTask) => perform(() => service.setTaskCompleted({ id: task.id, version: task.version, completed: !task.completedAt }))} onDelete={(task: DailyTask) => perform(() => service.deleteTask({ id: task.id, version: task.version }))} /> : !error ? <div className="dashboard-execution-loading" aria-live="polite">正在整理今天的学习安排…</div> : null}
        <CalendarMonthCard grid={calendarGrid} year={visibleMonth.year} monthIndex={visibleMonth.monthIndex} today={localDateKey(new Date())} examDate={settings.examDate} summaries={monthSummaries} loading={monthLoading} error={monthError} selectedDate={selectedDate} onPrevious={() => shiftMonth(-1)} onToday={() => setVisibleMonth(currentMonth())} onNext={() => shiftMonth(1)} onSelect={openDay} onRetry={() => void loadMonth()} />
      </section>
      <TodayReviewCard summary={reviewSummary} loading={reviewLoading} onRetry={() => void loadReview(summary?.tasks ?? [])} />
      <section className="dashboard-trend-grid" aria-label="本月学习节奏">
        {summary ? <div aria-label="最近七天学习趋势"><StudyGrowthPanel streakDays={summary.streakDays} trend={summary.trend} showStreak={false} /></div> : !error ? <div className="dashboard-signal-loading" aria-live="polite">正在整理本月学习信号…</div> : null}
      </section>
      <CalendarDayDrawer open={drawerOpen} localDate={selectedDate} summary={selectedSummary} loading={drawerLoading} error={drawerError} busy={busy} triggerRef={selectedTriggerRef} onClose={closeDrawer} onRetry={() => void loadSelectedDay(selectedDate)} onCreate={(title) => performSelected(() => service.createTask({ localDate: selectedDate, title }))} onToggle={(task) => performSelected(() => service.setTaskCompleted({ id: task.id, version: task.version, completed: !task.completedAt }))} onDelete={(task) => performSelected(() => service.deleteTask({ id: task.id, version: task.version }))} />
    </main>
  );
}
