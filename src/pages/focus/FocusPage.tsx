import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Minimize2, Play } from "lucide-react";
import { useSearchParams } from "react-router";
import { createDashboardService } from "../../services/dashboard/dashboard.service";
import { createFocusService } from "../../services/focus/focus.service";
import { createFocusPlanService } from "../../services/focus/focus-plan.service";
import { loadSettings, saveSettings } from "../../services/settings/settings.repository";
import type { AppSettings } from "../../services/settings/settings.types";
import type { FocusInterruption, FocusInterruptionReason, FocusPlan, FocusPlanService, FocusPreset, FocusService, FocusSession, FocusSubject, StartFocusInput } from "../../services/focus/focus.types";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import { createDashboardDayQuery, localDateKey } from "../../utils/dashboard-calendar";
import { FocusTaskRail } from "./components/FocusTaskRail";
import { FocusSetupPanel } from "./components/FocusSetupPanel";
import { FocusTimerStage } from "./components/FocusTimerStage";
import { FocusInterruptionDialog } from "./components/FocusInterruptionDialog";
import { FocusReviewDialog } from "./components/FocusReviewDialog";
import { FocusEnvironmentPanel } from "./components/FocusEnvironmentPanel";
import { FocusDrawer } from "./components/FocusDrawer";
import { FocusQuickTools } from "./components/FocusQuickTools";
import {
  createFocusCompletionNotifier,
  type FocusCompletionNotifier,
} from "../../services/notifications/focus-completion-notifier";
import { useFocusClock } from "./useFocusClock";
import { useFocusCompletionNotification } from "./useFocusCompletionNotification";
import { focusErrorCode, focusErrorMessage } from "./focus-error";
import "./focus-workspace.css";

const subjects: { value: FocusSubject; label: string }[] = [
  { value: "english", label: "英语" }, { value: "math", label: "数学" },
  { value: "specialty", label: "专业课" }, { value: "politics", label: "政治" }, { value: "other", label: "其他" },
];
const soundNames: Record<AppSettings["focusSound"], string> = { off: "未开启", white: "白噪音", pink: "粉噪音", brown: "棕噪音" };
const focusGreeting = (hour: number) => hour < 6 ? "深夜好" : hour < 12 ? "上午好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
export interface FocusPageProps { focusService?: FocusService; dashboardService?: DashboardService; focusPlanService?: FocusPlanService; completionNotifier?: FocusCompletionNotifier }
type FocusReviewInput = { planCompleted: boolean; completedCycles: number; focusRating: number; note: string };

export function FocusPage({ focusService: suppliedFocus, dashboardService: suppliedDashboard, focusPlanService: suppliedPlans, completionNotifier: suppliedCompletionNotifier }: FocusPageProps = {}) {
  const [searchParams] = useSearchParams();
  const requestedSubject = searchParams.get("subject");
  const initialSubject = subjects.some((item) => item.value === requestedSubject) ? requestedSubject as FocusSubject : "english";
  const requestedGoal = (searchParams.get("goal") ?? "").slice(0, 120);
  const requestedLearningItemId = searchParams.get("learningItemId");
  const initialLearningItemId = requestedLearningItemId && /^[A-Za-z0-9:_-]{1,120}$/.test(requestedLearningItemId) ? requestedLearningItemId : null;
  const focusService = useMemo(() => suppliedFocus ?? createFocusService(), [suppliedFocus]);
  const dashboardService = useMemo(() => suppliedDashboard ?? createDashboardService(), [suppliedDashboard]);
  const focusPlanService = useMemo(() => suppliedPlans ?? createFocusPlanService(), [suppliedPlans]);
  const completionNotifier = useMemo(() => suppliedCompletionNotifier ?? createFocusCompletionNotifier(), [suppliedCompletionNotifier]);
  const today = localDateKey(new Date());
  const [session, setSession] = useState<FocusSession | null>(null);
  const clock = useFocusClock(session);
  const completionMessage = useFocusCompletionNotification(session, clock, completionNotifier);
  const [plans, setPlans] = useState<FocusPlan[]>([]);
  const [presets, setPresets] = useState<FocusPreset[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FocusPlan | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [interruptions, setInterruptions] = useState<FocusInterruption[]>([]);
  const [interruptionOpen, setInterruptionOpen] = useState(false);
  const [interruptionError, setInterruptionError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [focusPreferences, setFocusPreferences] = useState(() => loadSettings());
  const [immersive, setImmersive] = useState(false);
  const [drawer, setDrawer] = useState<"settings" | "environment" | null>(null);
  const autoAdvanceKey = useRef("");
  const refresh = useCallback(async () => {
    const [active, summary, todayPlans, availablePresets] = await Promise.all([focusService.getActive(), dashboardService.getSummary(createDashboardDayQuery()), focusPlanService.list(today), focusService.listPresets()]);
    setSession(active); setTodaySeconds(summary.todaySeconds); setPlans(todayPlans); setPresets(availablePresets);
  }, [dashboardService, focusPlanService, focusService, today]);
  useEffect(() => { void refresh().catch(() => setError("专注记录暂时无法读取")); }, [refresh]);
  useEffect(() => { const onVisible = () => { if (document.visibilityState === "visible") void refresh(); }; document.addEventListener("visibilitychange", onVisible); return () => document.removeEventListener("visibilitychange", onVisible); }, [refresh]);
  useEffect(() => {
    document.body.classList.toggle("focus-immersive", immersive);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !interruptionOpen && !reviewOpen) setImmersive(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.classList.remove("focus-immersive"); window.removeEventListener("keydown", onKeyDown); };
  }, [immersive, interruptionOpen, reviewOpen]);
  useEffect(() => {
    if (session?.mode === "pomodoro" && session.phase === "work" && session.timer.status === "running" && clock?.expired) {
      void refresh().catch(() => setError("计时状态刷新失败，请重试"));
    }
    if (session?.phase === "break" && session.autoStartWork && clock?.expired) {
      const key = `${session.timer.id}:${session.cycleNumber}:${session.phaseStartedAt}`;
      if (autoAdvanceKey.current !== key) {
        autoAdvanceKey.current = key;
        void act(async () => {
          await focusService.setPhase({ timerId: session.timer.id, phase: "work", cycleNumber: session.cycleNumber + 1, cycleStartSeconds: session.timer.accumulatedSeconds });
          await dashboardService.resumeTimer({ id: session.timer.id, version: session.timer.version }, new Date().toISOString());
        });
      }
    }
  }, [clock?.expired, dashboardService, focusService, refresh, session]);
  const todayMinutes = useMemo(() => Math.floor(todaySeconds / 60), [todaySeconds]);
  async function act(operation: () => Promise<void>) {
    setBusy(true); setError("");
    try { await operation(); await refresh(); } catch (cause) { setError(focusErrorMessage(cause, "操作失败，请重试")); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }
  async function recordInterruption(input: { reason: FocusInterruptionReason; note: string; pause: boolean }) {
    if (!session || !clock) return;
    setBusy(true); setInterruptionError("");
    try {
      const saved = await focusService.addInterruption({ timerId: session.timer.id, reason: input.reason, note: input.note, elapsedSeconds: clock.elapsed });
      setInterruptions((current) => [...current, saved]);
      if (input.pause && session.timer.status === "running") {
        await dashboardService.pauseTimer({ id: session.timer.id, version: session.timer.version }, new Date().toISOString());
        await refresh();
      }
      setInterruptionOpen(false);
    } catch (cause) { setInterruptionError(focusErrorMessage(cause, "中断记录未能保存，请重试")); }
    finally { setBusy(false); }
  }
  async function openReview() {
    if (!session) return;
    setReviewError(""); setReviewOpen(true);
    try { setInterruptions(await focusService.listInterruptions(session.timer.id)); }
    catch (cause) { setReviewError(focusErrorMessage(cause, "中断记录暂时无法读取")); }
  }
  async function submitReview(timerId: string, timerVersion: number, input: FocusReviewInput) {
    try {
      return await focusService.completeReview({ timerId, timerVersion, ...input });
    } catch (cause) {
      if (focusErrorCode(cause) !== "DASHBOARD_CONFLICT") throw cause;
      const latest = await focusService.getActive();
      if (!latest || latest.timer.id !== timerId || latest.timer.version === timerVersion) throw cause;
      return focusService.completeReview({ timerId, timerVersion: latest.timer.version, ...input });
    }
  }
  async function completeReview(input: FocusReviewInput) {
    if (!session) return;
    setBusy(true); setReviewError("");
    try {
      await submitReview(session.timer.id, session.timer.version, input);
      setReviewOpen(false); setSelectedPlan(null); setInterruptions([]);
      await refresh();
    } catch (cause) { setReviewError(focusErrorMessage(cause, "结束专注失败，复盘内容已保留，请重试")); }
    finally { setBusy(false); }
  }
  const completedCycles = !session || session.mode === "open" ? 0 : Math.max(0, session.cycleNumber - (session.phase === "work" && !clock?.expired ? 1 : 0));
  function updateFocusPreferences(changes: Partial<Pick<AppSettings, "focusSound" | "focusSoundVolume" | "focusSoundDuringBreak">>) {
    setFocusPreferences((current) => { const next = { ...current, ...changes }; saveSettings(next); return next; });
  }
  const versioned = session ? { id: session.timer.id, version: session.timer.version } : null;
  return <div className={`page focus-page focus-workspace-page${immersive ? " is-immersive" : ""}`}>
    {immersive && <button className="focus-immersive-exit" aria-label="退出沉浸" onClick={() => setImmersive(false)}><Minimize2 size={17} />退出沉浸 <kbd>Esc</kbd></button>}
    <header className="focus-workspace-header"><div><span className="focus-workspace-header__label">专注控制台</span><h1>{session ? `${focusGreeting(new Date().getHours())}，准备进入第 ${session.cycleNumber} 轮` : "准备进入下一轮专注"}</h1></div><div className="focus-today"><small>今日专注</small><strong>{todayMinutes}</strong><span>分钟</span></div></header>
    {error && <p role="alert" className="focus-error">{error}</p>}
    {completionMessage ? <p className="focus-completion-notice" role="status" aria-live="polite">{completionMessage}</p> : null}
    <div className="focus-workspace" data-testid="focus-workspace" data-layout="spectrum-console">
      <section className="focus-workspace__stage">
      {session && clock ? <FocusTimerStage session={session} clock={clock} busy={busy} interruptionCount={interruptions.length}
        onPause={() => void act(async () => { if (versioned) await dashboardService.pauseTimer(versioned, new Date().toISOString()); })}
        onResume={() => void act(async () => { if (versioned) await dashboardService.resumeTimer(versioned, new Date().toISOString()); })}
        onStartBreak={() => void act(async () => {
          if (!versioned) return;
          const timer = session.timer.status === "running"
            ? await dashboardService.pauseTimer(versioned, new Date().toISOString())
            : session.timer;
          await focusService.setPhase({ timerId: timer.id, phase: "break", cycleNumber: session.cycleNumber, cycleStartSeconds: timer.accumulatedSeconds });
        })}
        onNextCycle={() => void act(async () => { if (!versioned) return; await focusService.setPhase({ timerId: session.timer.id, phase: "work", cycleNumber: session.cycleNumber + 1, cycleStartSeconds: session.timer.accumulatedSeconds }); await dashboardService.resumeTimer(versioned, new Date().toISOString()); })}
        onInterrupt={() => { setInterruptionError(""); setInterruptionOpen(true); }}
        onFinish={() => void openReview()}
      /> : <section className="focus-stage focus-stage--ready" aria-label="专注计时" data-art-direction="spectrum-console">
          <div className="focus-spectrum-wave" data-testid="focus-spectrum-wave" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
          <div className="focus-stage__top"><span><Clock3 size={18} /> 准备开始</span><span>你的专属学习时段</span></div>
          <div className="focus-ready-clock" aria-hidden="true">25:00</div>
          <p className="focus-goal">{selectedPlan ? `下一项：${selectedPlan.title}` : "现在，只做一件事。"}</p>
          <button className="focus-ready-start" aria-label="设置并开始" onClick={() => setDrawer("settings")}><Play size={20} />设置并开始</button>
          <div className="focus-ready-features"><span>自定义周期</span><span>长短休息</span><span>中断记录</span><span>结束复盘</span></div>
        </section>}
        <FocusQuickTools settingsDisabled={!!session || busy} onOpenSettings={() => setDrawer("settings")} onOpenEnvironment={() => setDrawer("environment")} onImmersive={() => setImmersive(true)} />
      </section>
      <FocusTaskRail localDate={today} initialPlans={plans} service={focusPlanService} disabled={!!session} activePlanId={session?.planId ?? null} environmentLabel={soundNames[focusPreferences.focusSound]} onOpenEnvironment={() => setDrawer("environment")} onStartPlan={(plan) => { setSelectedPlan(plan); setDrawer("settings"); }} />
    </div>
    <FocusDrawer open={drawer === "settings"} title="专注设置" onClose={() => setDrawer(null)}>
      <FocusSetupPanel key={selectedPlan?.id ?? initialLearningItemId ?? "free"} presets={presets} initialSubject={selectedPlan?.subject ?? initialSubject} initialGoal={selectedPlan?.title ?? requestedGoal} planId={selectedPlan?.id ?? null} learningItemId={selectedPlan?.learningItemId ?? initialLearningItemId} disabled={!!session || busy}
          onStart={(input: StartFocusInput) => act(async () => { await focusService.start(input); setDrawer(null); })}
          onSavePreset={(input) => act(async () => { const saved = await focusService.createPreset(input); setPresets((current) => [...current, saved]); })}
      />
    </FocusDrawer>
    <FocusDrawer open={drawer === "environment"} title="专注环境" onClose={() => setDrawer(null)}>
      <FocusEnvironmentPanel sound={focusPreferences.focusSound} volume={focusPreferences.focusSoundVolume} duringBreak={focusPreferences.focusSoundDuringBreak} phase={session?.phase ?? null} immersive={immersive} onImmersiveChange={setImmersive} onChange={updateFocusPreferences} />
    </FocusDrawer>
    <FocusInterruptionDialog open={interruptionOpen} busy={busy} error={interruptionError} onClose={() => setInterruptionOpen(false)} onSubmit={recordInterruption} />
    <FocusReviewDialog open={reviewOpen} busy={busy} error={reviewError} goal={session?.goal ?? ""} hasPlan={!!session?.planId} effectiveSeconds={clock?.elapsed ?? 0} interruptionCount={interruptions.length} defaultCompletedCycles={completedCycles} onClose={() => setReviewOpen(false)} onSubmit={completeReview} />
  </div>;
}
