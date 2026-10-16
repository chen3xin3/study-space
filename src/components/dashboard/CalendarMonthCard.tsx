import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CalendarDaySummary } from "../../services/dashboard/dashboard.types";
import { presentCalendarDay } from "../../utils/calendar-day-presentation";
import { getChinaDayInfo } from "../../utils/china-holidays";
import { getChineseCalendarInfo } from "../../utils/chinese-calendar";
import type { CalendarGridDay } from "../../utils/dashboard-calendar";
import { Card } from "../ui/Card";

interface CalendarMonthCardProps {
  grid: CalendarGridDay[];
  year: number;
  monthIndex: number;
  today: string;
  examDate: string;
  summaries: CalendarDaySummary[];
  loading: boolean;
  error: string;
  selectedDate: string;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
  onSelect: (localDate: string, trigger: HTMLButtonElement) => void;
  onRetry: () => void;
}

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarMonthCard({ grid, year, monthIndex, today, examDate, summaries, loading, error, selectedDate, onPrevious, onToday, onNext, onSelect, onRetry }: CalendarMonthCardProps) {
  const dayRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const preferredIndex = Math.max(0, grid.findIndex((day) => day.localDate === selectedDate) >= 0
    ? grid.findIndex((day) => day.localDate === selectedDate)
    : grid.findIndex((day) => day.localDate === today) >= 0
      ? grid.findIndex((day) => day.localDate === today)
      : grid.findIndex((day) => day.inCurrentMonth));
  const [rovingIndex, setRovingIndex] = useState(preferredIndex);
  useEffect(() => { setRovingIndex(preferredIndex); }, [preferredIndex, year, monthIndex]);
  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.localDate, summary])), [summaries]);
  const lunarMap = useMemo(
    () => new Map(grid.map((day) => [day.localDate, day.inCurrentMonth ? getChineseCalendarInfo(day.localDate) : null])),
    [grid, year, monthIndex],
  );
  return <Card className="calendar-card" aria-label="学习日历">
    <header className="calendar-card__header">
      <div><span className="section-kicker">学习日历</span><h2>{year}年{monthIndex + 1}月</h2></div>
      <nav className="calendar-nav" aria-label="切换月份">
        <button type="button" aria-label="上个月" onClick={onPrevious}><ChevronLeft size={18} /></button>
        <button type="button" className="calendar-nav__today" onClick={onToday}>回到今天</button>
        <button type="button" aria-label="下个月" onClick={onNext}><ChevronRight size={18} /></button>
      </nav>
    </header>
    <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>周{day}</span>)}</div>
    <div className="calendar-grid">
      {grid.map((day, index) => {
        const summary = summaryMap.get(day.localDate);
        const unfinished = Math.max(0, (summary?.totalTasks ?? 0) - (summary?.completedTasks ?? 0));
        const isToday = day.localDate === today;
        const isExam = day.localDate === examDate;
        const isSelected = day.localDate === selectedDate;
        const allComplete = Boolean(summary?.totalTasks) && unfinished === 0;
        const studyOnly = Boolean(summary?.studySeconds) && !summary?.totalTasks;
        const specialDay = day.inCurrentMonth ? getChinaDayInfo(day.localDate) : null;
        const isHoliday = specialDay?.kind === "holiday";
        const isAdjustedWorkday = specialDay?.kind === "adjusted-workday";
        const isWeekend = !isAdjustedWorkday && (day.date.getDay() === 0 || day.date.getDay() === 6);
        const presentation = presentCalendarDay({
          localDate: day.localDate,
          month: day.date.getMonth() + 1,
          day: day.dayNumber,
          inCurrentMonth: day.inCurrentMonth,
          isToday,
          isSelected,
          isExam,
          isWeekend,
          holidayName: specialDay?.name ?? "",
          holidayKind: specialDay?.kind ?? null,
          lunar: lunarMap.get(day.localDate) ?? null,
          totalTasks: summary?.totalTasks ?? 0,
          completedTasks: summary?.completedTasks ?? 0,
          studySeconds: summary?.studySeconds ?? 0,
        });
        const classes = ["calendar-day", day.inCurrentMonth ? "" : "is-outside", isHoliday ? "is-holiday" : "", isAdjustedWorkday ? "is-adjusted-workday" : "", isWeekend ? "is-weekend" : "", isToday ? "is-today" : "", isSelected ? "is-selected" : "", isExam ? "is-exam" : "", unfinished ? "has-unfinished" : "", allComplete ? "is-complete" : "", studyOnly ? "is-study-only" : ""].filter(Boolean).join(" ");
        const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
          const offset = offsets[event.key];
          if (!offset) return;
          event.preventDefault();
          const nextIndex = Math.max(0, Math.min(41, index + offset));
          setRovingIndex(nextIndex);
          dayRefs.current[nextIndex]?.focus();
        };
        return <button ref={(element) => { dayRefs.current[index] = element; }} className={classes} type="button" key={day.localDate} aria-label={presentation.accessibleLabel} aria-pressed={isSelected} tabIndex={index === rovingIndex ? 0 : -1} onFocus={() => setRovingIndex(index)} onKeyDown={moveFocus} onClick={(event) => onSelect(day.localDate, event.currentTarget)}>
          <span className="calendar-day__topline">
            <span className="calendar-day__number">{day.dayNumber}</span>
            {specialDay ? <span className={`calendar-day__badge calendar-day__badge--${specialDay.kind}`} aria-hidden="true">{isHoliday ? "休" : "调"}</span> : null}
          </span>
          {presentation.secondaryLabel ? <span className="calendar-day__subline" aria-hidden="true">{presentation.secondaryLabel}</span> : null}
          {presentation.taskProgress === "完成"
            ? <span className="calendar-day__progress is-complete" aria-label="待办全部完成">✓</span>
            : presentation.taskProgress
              ? <span className="calendar-day__progress" aria-hidden="true">{presentation.taskProgress}</span>
              : null}
          {isExam ? <span className="calendar-day__exam" aria-hidden="true">考</span> : null}
        </button>;
      })}
    </div>
    <footer className="calendar-legend" aria-label="日历图例"><span><b className="calendar-legend__badge is-holiday">休</b>法定假日</span><span><b className="calendar-legend__badge is-adjusted-workday">调</b>调休安排</span></footer>
    {loading ? <div className="calendar-card__status" aria-live="polite">正在整理本月记录…</div> : null}
    {error ? <div className="calendar-card__error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>重新加载月历</button></div> : null}
  </Card>;
}
