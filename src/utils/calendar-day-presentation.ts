import type { ChineseCalendarInfo } from "./chinese-calendar";

export type CalendarHolidayKind = "holiday" | "adjusted-workday" | null;

export interface CalendarDayPresentationInput {
  localDate: string;
  month: number;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isExam: boolean;
  isWeekend: boolean;
  holidayName: string;
  holidayKind: CalendarHolidayKind;
  lunar: ChineseCalendarInfo | null;
  totalTasks: number;
  completedTasks: number;
  studySeconds: number;
}

export interface CalendarDayPresentation {
  secondaryLabel: string;
  taskProgress: string;
  accessibleLabel: string;
}

export function presentCalendarDay(input: CalendarDayPresentationInput): CalendarDayPresentation {
  if (!input.inCurrentMonth) {
    return { secondaryLabel: "", taskProgress: "", accessibleLabel: `${input.month}月${input.day}日` };
  }
  const secondaryLabel = !input.inCurrentMonth
    ? ""
    : input.holidayName || input.lunar?.festival || input.lunar?.solarTerm || input.lunar?.lunarShort || "";
  const taskProgress = !input.inCurrentMonth || input.totalTasks === 0
    ? ""
    : input.completedTasks === input.totalTasks
      ? "完成"
      : `${input.completedTasks}/${input.totalTasks}`;
  const taskDescription = input.totalTasks === 0
    ? ""
    : input.completedTasks === input.totalTasks
      ? "全部待办已完成"
      : `待办完成${input.completedTasks}项，共${input.totalTasks}项`;
  const phrases = [
    `${input.month}月${input.day}日`,
    input.inCurrentMonth ? input.lunar?.lunarFull ?? "" : "",
    input.holidayKind === "holiday" ? `${input.holidayName}，法定假日，休` : "",
    input.holidayKind === "adjusted-workday" ? `${input.holidayName}，调休安排，调` : "",
    input.isWeekend ? "周末" : "",
    input.isToday ? "今天" : "",
    input.isSelected ? "已选择" : "",
    input.isExam ? "考试日" : "",
    taskDescription,
    input.studySeconds > 0 ? `学习${Math.floor(input.studySeconds / 60)}分钟` : "",
  ].filter(Boolean);
  return { secondaryLabel, taskProgress, accessibleLabel: phrases.join("，") };
}
