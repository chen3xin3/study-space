import type { CalendarMonthQuery, DailyWindow, DashboardDayQuery } from "../services/dashboard/dashboard.types";

export interface CalendarGridDay extends DailyWindow {
  date: Date;
  dayNumber: number;
  inCurrentMonth: boolean;
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDailyWindow(date: Date): DailyWindow {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { localDate: localDateKey(start), startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function createCalendarGrid(year: number, monthIndex: number): CalendarGridDay[] {
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthIndex, 1 - mondayOffset + index);
    return {
      ...createDailyWindow(date),
      date,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex && date.getFullYear() === year,
    };
  });
}

export function createCalendarMonthQuery(year: number, monthIndex: number): CalendarMonthQuery {
  return { days: createCalendarGrid(year, monthIndex).map(({ localDate, startUtc, endUtc }) => ({ localDate, startUtc, endUtc })) };
}

export function createDashboardDayQuery(date = new Date()): DashboardDayQuery {
  const selected = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const current = createDailyWindow(selected);
  const sevenDays = Array.from({ length: 7 }, (_, index) =>
    createDailyWindow(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - 6 + index)),
  );
  return {
    localDate: current.localDate,
    dayStartUtc: current.startUtc,
    dayEndUtc: current.endUtc,
    sevenDays,
  };
}
