import { Solar } from "lunar-typescript";

export interface ChineseCalendarInfo {
  lunarFull: string;
  lunarMonth: string;
  lunarDay: string;
  lunarShort: string;
  festival: string;
  solarTerm: string;
}

function parseLocalDate(localDate: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return [year, month, day];
}

export function getChineseCalendarInfo(localDate: string): ChineseCalendarInfo | null {
  const parts = parseLocalDate(localDate);
  if (!parts) return null;
  try {
    const solar = Solar.fromYmd(parts[0], parts[1], parts[2]);
    const lunar = solar.getLunar();
    const lunarMonth = `${lunar.getMonthInChinese()}月`;
    const lunarDay = lunar.getDayInChinese();
    return {
      lunarFull: `农历${lunar.getYearInChinese()}年${lunarMonth}${lunarDay}`,
      lunarMonth,
      lunarDay,
      lunarShort: lunar.getDay() === 1 ? lunarMonth : lunarDay,
      festival: lunar.getFestivals()[0] ?? solar.getFestivals()[0] ?? "",
      solarTerm: lunar.getJieQi(),
    };
  } catch {
    return null;
  }
}
