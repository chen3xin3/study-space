export type ChinaDayKind = "holiday" | "adjusted-workday";

export interface ChinaDayInfo {
  kind: ChinaDayKind;
  name: string;
}

const official2026Days = new Map<string, Readonly<ChinaDayInfo>>([
  ...holidayRange("2026-01", 1, 3, "元旦"),
  ["2026-01-04", adjustedWorkday("元旦调休")],
  ["2026-02-14", adjustedWorkday("春节调休")],
  ...holidayRange("2026-02", 15, 23, "春节"),
  ["2026-02-28", adjustedWorkday("春节调休")],
  ...holidayRange("2026-04", 4, 6, "清明节"),
  ...holidayRange("2026-05", 1, 5, "劳动节"),
  ["2026-05-09", adjustedWorkday("劳动节调休")],
  ...holidayRange("2026-06", 19, 21, "端午节"),
  ["2026-09-20", adjustedWorkday("国庆节调休")],
  ...holidayRange("2026-09", 25, 27, "中秋节"),
  ...holidayRange("2026-10", 1, 7, "国庆节"),
  ["2026-10-10", adjustedWorkday("国庆节调休")],
]);

function holidayRange(month: string, firstDay: number, lastDay: number, name: string): Array<[string, Readonly<ChinaDayInfo>]> {
  return Array.from({ length: lastDay - firstDay + 1 }, (_, index) => [
    `${month}-${String(firstDay + index).padStart(2, "0")}`,
    Object.freeze({ kind: "holiday" as const, name }),
  ]);
}

function adjustedWorkday(name: string): Readonly<ChinaDayInfo> {
  return Object.freeze({ kind: "adjusted-workday", name });
}

export function getChinaDayInfo(localDate: string): ChinaDayInfo | null {
  const info = official2026Days.get(localDate);
  return info ? { ...info } : null;
}
