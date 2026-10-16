import { describe, expect, it } from "vitest";
import { getChinaDayInfo } from "./china-holidays";

describe("getChinaDayInfo", () => {
  it.each([
    ["2026-01-01", "元旦"],
    ["2026-01-03", "元旦"],
    ["2026-02-15", "春节"],
    ["2026-02-19", "春节"],
    ["2026-02-23", "春节"],
    ["2026-04-04", "清明节"],
    ["2026-04-05", "清明节"],
    ["2026-04-06", "清明节"],
    ["2026-05-01", "劳动节"],
    ["2026-05-03", "劳动节"],
    ["2026-05-05", "劳动节"],
    ["2026-06-19", "端午节"],
    ["2026-06-20", "端午节"],
    ["2026-06-21", "端午节"],
    ["2026-09-25", "中秋节"],
    ["2026-09-26", "中秋节"],
    ["2026-09-27", "中秋节"],
    ["2026-10-01", "国庆节"],
    ["2026-10-04", "国庆节"],
    ["2026-10-07", "国庆节"],
  ])("marks %s as %s holiday", (localDate, name) => {
    expect(getChinaDayInfo(localDate)).toEqual({ kind: "holiday", name });
  });

  it.each([
    ["2026-01-04", "元旦调休"],
    ["2026-02-14", "春节调休"],
    ["2026-02-28", "春节调休"],
    ["2026-05-09", "劳动节调休"],
    ["2026-09-20", "国庆节调休"],
    ["2026-10-10", "国庆节调休"],
  ])("marks %s as an adjusted workday", (localDate, name) => {
    expect(getChinaDayInfo(localDate)).toEqual({ kind: "adjusted-workday", name });
  });

  it("returns no special status for an ordinary weekday", () => {
    expect(getChinaDayInfo("2026-09-28")).toBeNull();
  });

  it("does not fabricate unpublished years", () => {
    expect(getChinaDayInfo("2027-01-01")).toBeNull();
  });
});
