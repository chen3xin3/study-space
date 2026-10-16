import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDateKey, type StatisticsPeriod, type StatisticsRange } from "../statistics.model";

const periods: Array<{ id: StatisticsPeriod; label: string }> = [{ id: "day", label: "日" }, { id: "week", label: "周" }, { id: "month", label: "月" }, { id: "custom", label: "自定义" }];
const parseLocalDate = (value: string) => new Date(`${value}T00:00:00`);

export interface StatisticsRangePickerProps {
  period: StatisticsPeriod;
  range: StatisticsRange;
  onPeriodChange(period: StatisticsPeriod): void;
  onMove(direction: -1 | 1): void;
  onCustomRangeChange(start: Date, end: Date): void;
}

export function StatisticsRangePicker({ period, range, onPeriodChange, onMove, onCustomRangeChange }: StatisticsRangePickerProps) {
  return <section className="statistics-range" aria-label="统计日期范围">
    <div className="statistics-range__top"><button aria-label="上一个时间段" onClick={() => onMove(-1)}><ChevronLeft /></button><strong>{range.label}</strong><button aria-label="下一个时间段" onClick={() => onMove(1)}><ChevronRight /></button></div>
    <div className="statistics-range__tabs" role="tablist" aria-label="统计时间范围">{periods.map((item) => <button key={item.id} role="tab" aria-selected={period === item.id} className={period === item.id ? "is-active" : ""} onClick={() => onPeriodChange(item.id)}>{item.label}</button>)}</div>
    {period === "custom" && <div className="statistics-range__custom"><label>开始日期<input aria-label="开始日期" type="date" value={localDateKey(range.start)} onChange={(event) => onCustomRangeChange(parseLocalDate(event.target.value), range.end)} /></label><span>至</span><label>结束日期<input aria-label="结束日期" type="date" value={localDateKey(range.end)} onChange={(event) => onCustomRangeChange(range.start, parseLocalDate(event.target.value))} /></label></div>}
  </section>;
}
