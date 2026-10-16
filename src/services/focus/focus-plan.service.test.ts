import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserFocusPlanService } from "./browser-focus-plan.service";
import { TauriFocusPlanService } from "./tauri-focus-plan.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("BrowserFocusPlanService", () => {
  beforeEach(() => localStorage.clear());

  it("creates, updates, completes, reorders, and deletes today's plans", async () => {
    const service = new BrowserFocusPlanService();
    const first = await service.create({ localDate: "2026-10-02", title: "英语精读", subject: "english", estimatedCycles: 2, repeatRule: "none", linkedDailyTaskId: null });
    const second = await service.create({ localDate: "2026-10-02", title: "高数例题", subject: "math", estimatedCycles: 3, repeatRule: "none", linkedDailyTaskId: null });
    const updated = await service.update({ ...first, title: "英语阅读复盘" });
    const completed = await service.setCompleted({ id: updated.id, version: updated.version, completed: true });
    expect(completed.completedAt).not.toBeNull();
    expect((await service.reorder("2026-10-02", [second.id, completed.id])).map((item) => item.id)).toEqual([second.id, completed.id]);
    await service.delete({ id: completed.id, version: completed.version + 1 });
    expect((await service.list("2026-10-02")).map((item) => item.id)).toEqual([second.id]);
  });

  it("generates one repeat for an eligible day even when listed twice", async () => {
    const service = new BrowserFocusPlanService();
    await service.create({ localDate: "2026-10-02", title: "每日复习", subject: "english", estimatedCycles: 1, repeatRule: "daily", linkedDailyTaskId: null });
    expect(await service.list("2026-10-03")).toHaveLength(1);
    expect(await service.list("2026-10-03")).toHaveLength(1);
  });

  it("keeps the learning item relationship on a saved plan", async () => {
    const service = new BrowserFocusPlanService();
    const plan = await service.create({ localDate: "2026-10-03", title: "重做极限错题", subject: "math", estimatedCycles: 2, repeatRule: "none", linkedDailyTaskId: null, learningItemId: "item-1" });
    expect(plan.learningItemId).toBe("item-1");
    expect((await service.list("2026-10-03"))[0]?.learningItemId).toBe("item-1");
  });
});

describe("TauriFocusPlanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue([]);
  });

  it("uses stable plan command names and envelopes", async () => {
    const service = new TauriFocusPlanService();
    const create = { localDate: "2026-10-02", title: "英语精读", subject: "english" as const, estimatedCycles: 2, repeatRule: "none" as const, linkedDailyTaskId: null };
    const update = { ...create, id: "plan-1", version: 1 };
    await service.list("2026-10-02");
    await service.create(create);
    await service.update(update);
    await service.setCompleted({ id: "plan-1", version: 2, completed: true });
    await service.delete({ id: "plan-1", version: 3 });
    await service.reorder("2026-10-02", ["plan-2", "plan-1"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "list_focus_plans", { localDate: "2026-10-02" });
    expect(invoke).toHaveBeenNthCalledWith(2, "create_focus_plan", { input: create });
    expect(invoke).toHaveBeenNthCalledWith(3, "update_focus_plan", { input: update });
    expect(invoke).toHaveBeenNthCalledWith(4, "set_focus_plan_completed", { input: { id: "plan-1", version: 2, completed: true } });
    expect(invoke).toHaveBeenNthCalledWith(5, "delete_focus_plan", { input: { id: "plan-1", version: 3 } });
    expect(invoke).toHaveBeenNthCalledWith(6, "reorder_focus_plans", { input: { localDate: "2026-10-02", orderedIds: ["plan-2", "plan-1"] } });
  });
});
