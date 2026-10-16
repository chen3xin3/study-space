import { expect, it, vi } from "vitest";
import type { FocusHistoryItem, FocusService } from "../../services/focus/focus.types";
import { loadAllFocusHistory } from "./statistics.data";

const historyItem = (timerId: string): FocusHistoryItem => ({
  timerId, startedAt: "2026-10-01T08:00:00+08:00", endedAt: "2026-10-01T08:25:00+08:00",
  studySeconds: 1500, mode: "pomodoro", subject: "english", goal: "阅读",
  learningItemId: null, dailyTaskId: null,
});

it("loads every 30-item history page", async () => {
  const first = Array.from({ length: 30 }, (_, index) => historyItem(String(index)));
  const second = [historyItem("30"), historyItem("31")];
  const service = { listHistory: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) } as unknown as FocusService;

  await expect(loadAllFocusHistory(service)).resolves.toHaveLength(32);
  expect(service.listHistory).toHaveBeenNthCalledWith(1, 0);
  expect(service.listHistory).toHaveBeenNthCalledWith(2, 30);
});

it("stops after an empty first page", async () => {
  const service = { listHistory: vi.fn().mockResolvedValue([]) } as unknown as FocusService;
  await expect(loadAllFocusHistory(service)).resolves.toEqual([]);
  expect(service.listHistory).toHaveBeenCalledTimes(1);
});

it("surfaces history service errors", async () => {
  const service = { listHistory: vi.fn().mockRejectedValue(new Error("读取失败")) } as unknown as FocusService;
  await expect(loadAllFocusHistory(service)).rejects.toThrow("读取失败");
});
