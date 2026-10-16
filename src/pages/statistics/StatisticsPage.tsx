import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, RefreshCw, Target } from "lucide-react";
import { LearningJourney } from "../../components/learning-tools/LearningJourney";
import { createDashboardService } from "../../services/dashboard/dashboard.service";
import type { DashboardService, DashboardSummary } from "../../services/dashboard/dashboard.types";
import { createFocusService } from "../../services/focus/focus.service";
import type { FocusHistoryItem, FocusService } from "../../services/focus/focus.types";
import { createDashboardDayQuery } from "../../utils/dashboard-calendar";
import { FocusRecords } from "./components/FocusRecords";
import { FocusTimeDistribution } from "./components/FocusTimeDistribution";
import { StatisticsOverview } from "./components/StatisticsOverview";
import { StatisticsRangePicker } from "./components/StatisticsRangePicker";
import { StatisticsShareAction } from "./components/StatisticsShareAction";
import { StudyTrendChart } from "./components/StudyTrendChart";
import { SubjectDonutChart } from "./components/SubjectDonutChart";
import { loadAllFocusHistory } from "./statistics.data";
import { createFocusAnalytics, createStatisticsRange, createStatisticsShareText, moveStatisticsRange, type StatisticsPeriod } from "./statistics.model";
import "./statistics-dashboard.css";

export interface StatisticsPageProps { dashboardService?: DashboardService; focusService?: FocusService; now?: Date }

export function StatisticsPage({ dashboardService: suppliedDashboard, focusService: suppliedFocus, now: suppliedNow }: StatisticsPageProps = {}) {
  const dashboard = useMemo(() => suppliedDashboard ?? createDashboardService(), [suppliedDashboard]);
  const focus = useMemo(() => suppliedFocus ?? createFocusService(), [suppliedFocus]);
  const now = useMemo(() => suppliedNow ?? new Date(), [suppliedNow]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [history, setHistory] = useState<FocusHistoryItem[]>([]);
  const [period, setPeriod] = useState<StatisticsPeriod>("week");
  const [anchor, setAnchor] = useState(now);
  const [customStart, setCustomStart] = useState(now);
  const [customEnd, setCustomEnd] = useState(now);
  const [dashboardError, setDashboardError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setDashboardError("");
    try { setSummary(await dashboard.getSummary(createDashboardDayQuery(now))); }
    catch { setDashboardError("今日学习概览暂时无法读取"); }
  }, [dashboard, now]);
  const loadHistory = useCallback(async () => {
    setHistoryError(""); setHistoryLoading(true);
    try { setHistory(await loadAllFocusHistory(focus)); }
    catch { setHistoryError("专注记录暂时无法读取"); }
    finally { setHistoryLoading(false); }
  }, [focus]);
  useEffect(() => { void loadDashboard(); void loadHistory(); }, [loadDashboard, loadHistory]);

  const range = useMemo(() => createStatisticsRange(period, anchor, customStart, customEnd), [anchor, customEnd, customStart, period]);
  const analytics = useMemo(() => createFocusAnalytics(history, range), [history, range]);
  const shareText = useMemo(() => createStatisticsShareText(analytics, range), [analytics, range]);

  function move(direction: -1 | 1) {
    if (period !== "custom") { setAnchor((current) => moveStatisticsRange(period, current, direction)); return; }
    const days = Math.max(1, Math.round((customEnd.getTime() - customStart.getTime()) / 86_400_000) + 1);
    setCustomStart((current) => { const next = new Date(current); next.setDate(next.getDate() + days * direction); return next; });
    setCustomEnd((current) => { const next = new Date(current); next.setDate(next.getDate() + days * direction); return next; });
  }

  return <main className="page statistics-dashboard">
    <LearningJourney current="statistics" />
    <header className="statistics-dashboard__hero"><div><span className="eyebrow">FOCUS ANALYTICS</span><h1>学习统计</h1><p>用真实专注记录，看清时间去了哪里。</p></div><div className="statistics-dashboard__hero-actions">{summary && <div className="statistics-dashboard__today"><span><Target />今日任务 {summary.completedTasks}/{summary.totalTasks}</span><span><Flame />连续 {summary.streakDays} 天</span></div>}<StatisticsShareAction text={shareText} /></div></header>
    {dashboardError && <p className="statistics-dashboard__error" role="alert">{dashboardError}<button onClick={() => void loadDashboard()}><RefreshCw />重试概览</button></p>}
    {historyError && <p className="statistics-dashboard__error" role="alert">{historyError}<button onClick={() => void loadHistory()}><RefreshCw />重试专注记录</button></p>}
    <StatisticsRangePicker period={period} range={range} onPeriodChange={setPeriod} onMove={move} onCustomRangeChange={(start, end) => { setCustomStart(start); setCustomEnd(end); }} />
    {historyLoading ? <section className="statistics-dashboard__loading" aria-live="polite">正在整理全部专注记录…</section> : <><StatisticsOverview analytics={analytics} /><div className="statistics-dashboard__grid"><div className="statistics-dashboard__subject"><SubjectDonutChart subjects={analytics.subjects} totalSeconds={analytics.selected.seconds} /></div><div className="statistics-dashboard__trend"><StudyTrendChart points={analytics.trend} /></div><div className="statistics-dashboard__hours"><FocusTimeDistribution points={analytics.hourly} /></div><div className="statistics-dashboard__records"><FocusRecords records={analytics.records} /></div></div></>}
  </main>;
}
