import { CalendarCheck2, Clock3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { DailyTask, DashboardSummary } from "../../services/dashboard/dashboard.types";
import { getChinaDayInfo } from "../../utils/china-holidays";
import { getChineseCalendarInfo } from "../../utils/chinese-calendar";

interface CalendarDayDrawerProps {
  open: boolean;
  localDate: string;
  summary: DashboardSummary | null;
  loading: boolean;
  error: string;
  busy: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onRetry: () => void;
  onCreate: (title: string) => Promise<void>;
  onToggle: (task: DailyTask) => Promise<void>;
  onDelete: (task: DailyTask) => Promise<void>;
}

function formatDate(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${year}年${month}月${day}日${weekdays[new Date(year, month - 1, day, 12).getDay()]}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${minutes}分钟`;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}

export function CalendarDayDrawer({ open, localDate, summary, loading, error, busy, triggerRef, onClose, onRetry, onCreate, onToggle, onDelete }: CalendarDayDrawerProps) {
  const [title, setTitle] = useState("");
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const siblings = Array.from(layerRef.current?.parentElement?.children ?? []).filter((element) => element !== layerRef.current) as HTMLElement[];
    siblings.forEach((element) => { element.setAttribute("aria-hidden", "true"); element.inert = true; });
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === headingRef.current)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeys);
    return () => {
      window.removeEventListener("keydown", handleKeys);
      siblings.forEach((element) => { element.removeAttribute("aria-hidden"); element.inert = false; });
      triggerRef.current?.focus();
    };
  }, [onClose, open, triggerRef]);
  useEffect(() => { setTitle(""); setActionError(""); setStatus(""); }, [localDate]);
  if (!open) return null;
  const calendarInfo = getChineseCalendarInfo(localDate);
  const specialDay = getChinaDayInfo(localDate);
  const act = async (operation: () => Promise<void>, success = "") => { try { await operation(); setActionError(""); setStatus(success); } catch (caught) { setActionError(caught instanceof Error ? caught.message : "操作失败，请重试"); setStatus(""); } };
  const add = async () => { if (!title.trim()) { setActionError("请输入待办内容"); return; } await act(async () => { await onCreate(title.trim()); setTitle(""); }, "已添加待办"); };
  const label = `${formatDate(localDate)}安排`;
  return <div className="calendar-drawer-layer" ref={layerRef}>
    <button className="calendar-drawer-backdrop" type="button" tabIndex={-1} aria-label="关闭日期详情" onClick={onClose} />
    <aside className="calendar-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={label}>
      <header className="calendar-drawer__header">
        <div><span className="section-kicker">当天记录</span><h2 ref={headingRef} tabIndex={-1}>{formatDate(localDate)}</h2></div>
        <button className="calendar-drawer__close" type="button" aria-label="关闭" onClick={onClose}><X size={20} /></button>
      </header>
      <section className="calendar-drawer__date-context" aria-label="日期信息">
        {calendarInfo ? <p className="calendar-drawer__lunar">{calendarInfo.lunarFull}</p> : null}
        <div className="calendar-drawer__date-tags">
          {calendarInfo?.festival ? <span>{calendarInfo.festival}</span> : null}
          {calendarInfo?.solarTerm ? <span>{calendarInfo.solarTerm}</span> : null}
          {specialDay ? <span>{specialDay.kind === "holiday" ? `法定假日 · ${specialDay.name}` : "调休安排"}</span> : null}
        </div>
        {specialDay?.kind === "adjusted-workday" ? <small>这是法定节假日调休安排，学校具体安排请以学校通知为准。</small> : null}
      </section>
      {loading ? <div className="calendar-drawer__loading" aria-live="polite">正在读取当天安排…</div> : null}
      {error ? <div className="calendar-drawer__error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>重新加载当天安排</button></div> : null}
      {summary && !loading ? <>
        <div className="calendar-day-stats"><span><Clock3 size={18} /><small>学习时长</small><strong>{formatDuration(summary.todaySeconds)}</strong></span><span><CalendarCheck2 size={18} /><small>待办完成</small><strong>{summary.completedTasks} / {summary.totalTasks}</strong></span></div>
        <form className="calendar-drawer__add" onSubmit={(event) => { event.preventDefault(); void add(); }}><label className="sr-only" htmlFor="calendar-day-task">新增当天待办</label><input id="calendar-day-task" value={title} maxLength={200} placeholder="为这一天添加安排…" onChange={(event) => setTitle(event.target.value)} /><button className="primary-button" type="submit" disabled={busy}><Plus size={16} />添加</button></form>
        {actionError ? <p className="calendar-drawer__error" role="alert">{actionError}</p> : null}
        {status ? <p className="sr-only" role="status">{status}</p> : null}
        {summary.tasks.length ? <ul className="calendar-drawer__tasks">{summary.tasks.map((task) => <li className={task.completedAt ? "is-complete" : ""} key={task.id}><label><input type="checkbox" aria-label={`完成 ${task.title}`} checked={Boolean(task.completedAt)} disabled={busy} onChange={() => void act(() => onToggle(task), "待办状态已更新")} /><span>{task.title}</span></label><button type="button" aria-label={`删除 ${task.title}`} disabled={busy} onClick={() => void act(() => onDelete(task), "已删除待办")}><Trash2 size={16} /></button></li>)}</ul> : <div className="calendar-drawer__empty"><strong>这一天还没有安排</strong><span>可以先写下一件最重要的事。</span></div>}
      </> : null}
    </aside>
  </div>;
}
