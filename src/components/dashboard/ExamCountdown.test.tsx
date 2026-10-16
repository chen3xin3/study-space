import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsProvider } from "../../services/settings/SettingsProvider";
import { defaultSettings } from "../../services/settings/settings.defaults";
import { SETTINGS_STORAGE_KEY } from "../../services/settings/settings.repository";
import { ExamCountdown } from "./ExamCountdown";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function renderCountdown(examDate: string) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...defaultSettings, examDate }));
  return render(<MemoryRouter><SettingsProvider><ExamCountdown /></SettingsProvider></MemoryRouter>);
}

it("shows a live current time above the secondary countdown", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 28, 20, 18, 21));

  renderCountdown("2026-12-12");

  const clock = screen.getByLabelText("当前时间");
  expect(clock).toHaveTextContent("20:18:21");
  expect(clock).toHaveTextContent("2026年9月28日");
  expect(screen.getByRole("heading", { name: /距离考研还有/ })).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1_000));
  expect(clock).toHaveTextContent("20:18:22");
});

it("keeps the target-date settings link in the time card", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 28, 9, 0, 0));

  renderCountdown("2026-12-12");

  expect(screen.getByLabelText("当前时间与考研倒计时")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "目标日期 2026-12-12" })).toHaveAttribute("href", "/settings");
});

it("still directs an unset countdown to settings", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 28, 9, 0, 0));

  renderCountdown("");

  expect(screen.getByRole("heading", { name: "设置考试日期" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "设置考试日期" })).toHaveAttribute("href", "/settings");
});
