import { beforeEach, describe, expect, it } from "vitest";
import type { LearningItemDraft } from "./learning-item.types";
import { BrowserLearningItemService } from "./browser-learning-item.service";

const questionDraft: LearningItemDraft = {
  subject: "math",
  collection: "wrong-questions",
  kind: "question",
  title: "极限计算",
  content: "求一个重要极限",
  answer: "使用洛必达法则",
  tags: ["高数"],
  mastery: "learning",
  source: "第一章",
  score: null,
  maxScore: null,
  reviewAt: "2026-10-10",
};

describe("BrowserLearningItemService", () => {
  beforeEach(() => localStorage.clear());

  it("persists create and list across service instances", async () => {
    const created = await new BrowserLearningItemService(localStorage).create(questionDraft);
    const listed = await new BrowserLearningItemService(localStorage).list({ subject: "math" });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: created.id, title: "极限计算", version: 1, deletedAt: null });
  });

  it("filters search, subject, collection, kind and mastery", async () => {
    const service = new BrowserLearningItemService(localStorage);
    await service.create(questionDraft);
    await service.create({ ...questionDraft, subject: "politics", collection: "choice", title: "政治选择题", content: "关键词", tags: ["史纲"] });
    expect(await service.list({ subject: "math", collection: "wrong-questions", kind: "question", mastery: "learning", search: "洛必达" })).toHaveLength(1);
    expect(await service.list({ subject: "politics", search: "史纲" })).toHaveLength(1);
    expect(await service.list({ subject: "english" })).toHaveLength(0);
  });

  it("supports favorites, trash, restore and permanent delete", async () => {
    const service = new BrowserLearningItemService(localStorage);
    const created = await service.create(questionDraft);
    const favorite = await service.setFavorite(created.id, created.version, true);
    expect(await service.list({ favorite: true })).toHaveLength(1);
    const deleted = await service.setDeleted(favorite.id, favorite.version, true);
    expect(await service.list({ trash: false })).toHaveLength(0);
    expect(await service.list({ trash: true })).toEqual([deleted]);
    const restored = await service.setDeleted(deleted.id, deleted.version, false);
    const deletedAgain = await service.setDeleted(restored.id, restored.version, true);
    await service.deletePermanently(deletedAgain.id, deletedAgain.version);
    expect(await service.list({ trash: true })).toHaveLength(0);
  });

  it("updates, touches opened time and rejects stale versions", async () => {
    const service = new BrowserLearningItemService(localStorage);
    const created = await service.create(questionDraft);
    const updated = await service.update({ ...questionDraft, id: created.id, version: created.version, title: "极限复盘" });
    expect(updated).toMatchObject({ title: "极限复盘", version: 2 });
    const opened = await service.touchOpened(updated.id, updated.version);
    expect(opened.version).toBe(3);
    await expect(service.update({ ...questionDraft, id: created.id, version: 1 })).rejects.toThrow("内容已发生变化");
  });

  it("does not report permanent deletion before an item enters trash", async () => {
    const service = new BrowserLearningItemService(localStorage);
    const created = await service.create(questionDraft);
    await expect(service.deletePermanently(created.id, created.version)).rejects.toThrow("请先移入回收站");
  });

  it("keeps corrupted storage readable until a successful mutation replaces it", async () => {
    localStorage.setItem("study-space.learning-items.v1", "not-json");
    const service = new BrowserLearningItemService(localStorage);
    expect(await service.list({})).toEqual([]);
    expect(localStorage.getItem("study-space.learning-items.v1")).toBe("not-json");
    await service.create(questionDraft);
    expect(JSON.parse(localStorage.getItem("study-space.learning-items.v1") ?? "[]")).toHaveLength(1);
  });
});
