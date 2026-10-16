import { expect, it } from "vitest";
import { createCalendarGrid, createCalendarMonthQuery, createDashboardDayQuery } from "./dashboard-calendar";

it("builds a Monday-first six-week grid for February 2028", () => {
  const grid = createCalendarGrid(2028, 1);
  expect(grid).toHaveLength(42);
  expect(grid[0].localDate).toBe("2028-01-31");
  expect(grid.at(-1)?.localDate).toBe("2028-03-12");
  expect(grid.filter((day) => day.inCurrentMonth)).toHaveLength(29);
});

it("creates local UTC windows for a complete calendar grid", () => {
  const query = createCalendarMonthQuery(2026, 8);
  expect(query.days).toHaveLength(42);
  expect(query.days[0].localDate).toBe("2026-08-31");
  expect(Date.parse(query.days[0].endUtc) - Date.parse(query.days[0].startUtc)).toBeGreaterThan(0);
});

it("creates a dashboard query for any selected local date", () => {
  const query = createDashboardDayQuery(new Date(2026, 8, 27, 12));
  expect(query.localDate).toBe("2026-09-27");
  expect(query.sevenDays).toHaveLength(7);
  expect(query.sevenDays.at(-1)?.localDate).toBe("2026-09-27");
});

it("builds a stable six-week grid across a year boundary", () => {
  const grid = createCalendarGrid(2027, 0);
  expect(grid[0].localDate).toBe("2026-12-28");
  expect(grid.at(-1)?.localDate).toBe("2027-02-07");
  expect(grid.every((day) => Date.parse(day.endUtc) > Date.parse(day.startUtc))).toBe(true);
});
