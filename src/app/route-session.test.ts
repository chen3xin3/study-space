import { beforeEach, describe, expect, it } from "vitest";
import {
  ROUTE_SESSION_KEY,
  isSafeRestorableRoute,
  readRestorableRoute,
  rememberRoute,
} from "./route-session";

describe("safe route session", () => {
  beforeEach(() => localStorage.clear());

  it.each([
    "/english",
    "/english/words",
    "/english/essays",
    "/library/photos",
    "/library/files",
    "/focus",
    "/settings",
  ])("allows the stable route %s", (route) => {
    expect(isSafeRestorableRoute(route)).toBe(true);
  });

  it.each([
    "/english/words/import",
    "/english/words/record-id",
    "/english/essays/import/draft-id",
    "/english/essays/history/attempt-id",
    "/study/math/exams/item-id",
    "https://example.com/unsafe",
  ])("rejects sensitive or record-specific route %s", (route) => {
    expect(isSafeRestorableRoute(route)).toBe(false);
  });

  it("restores a safe route once only when opening at home", () => {
    localStorage.setItem(ROUTE_SESSION_KEY, "/library/photos");
    expect(readRestorableRoute(localStorage, "/")).toBe("/library/photos");
    expect(readRestorableRoute(localStorage, "/")).toBeNull();
  });

  it("removes an invalid saved route and does not overwrite it with unsafe pages", () => {
    localStorage.setItem(ROUTE_SESSION_KEY, "/english/words/import/private-session");
    expect(readRestorableRoute(localStorage, "/")).toBeNull();
    expect(localStorage.getItem(ROUTE_SESSION_KEY)).toBeNull();

    rememberRoute(localStorage, "/english/essays/import");
    expect(localStorage.getItem(ROUTE_SESSION_KEY)).toBeNull();
  });
});
