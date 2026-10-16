import { vi } from "vitest";
import type { LearningItem, LearningItemService } from "../../services/learning-items/learning-item.types";

export function learningItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: "item-1",
    subject: "math",
    collection: "wrong-questions",
    kind: "question",
    title: "极限计算",
    content: "求一个重要极限",
    answer: "洛必达法则",
    tags: ["高数"],
    mastery: "learning",
    source: "第一章",
    score: null,
    maxScore: null,
    reviewAt: "2026-10-10",
    favorite: false,
    lastOpenedAt: "2026-10-03T08:00:00Z",
    createdAt: "2026-10-03T08:00:00Z",
    updatedAt: "2026-10-03T08:00:00Z",
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

export function fakeLearningService(initial: LearningItem[] = []): LearningItemService {
  let items = initial.map((item) => ({ ...item }));
  const find = (id: string) => items.find((item) => item.id === id) ?? (() => { throw new Error("学习内容不存在"); })();
  return {
    list: vi.fn(async (query) => items.filter((item) => Boolean(item.deletedAt) === Boolean(query.trash))
      .filter((item) => !query.subject || item.subject === query.subject)
      .filter((item) => !query.collection || item.collection === query.collection)
      .filter((item) => query.favorite === undefined || item.favorite === query.favorite)
      .filter((item) => !query.search || `${item.title}${item.content}${item.answer}${item.tags.join("")}`.includes(query.search))),
    get: vi.fn(async (id) => find(id)),
    create: vi.fn(async (input) => { const item = learningItem({ ...input, id: "created" }); items = [item, ...items]; return item; }),
    update: vi.fn(async (input) => { const item = { ...find(input.id), ...input, version: input.version + 1 }; items = items.map((current) => current.id === item.id ? item : current); return item; }),
    setFavorite: vi.fn(async (id, version, favorite) => { const item = { ...find(id), favorite, version: version + 1 }; items = items.map((current) => current.id === id ? item : current); return item; }),
    setDeleted: vi.fn(async (id, version, deleted) => { const item = { ...find(id), deletedAt: deleted ? "2026-10-03T09:00:00Z" : null, version: version + 1 }; items = items.map((current) => current.id === id ? item : current); return item; }),
    touchOpened: vi.fn(async (id, version) => { const item = { ...find(id), lastOpenedAt: "2026-10-03T10:00:00Z", version: version + 1 }; items = items.map((current) => current.id === id ? item : current); return item; }),
    deletePermanently: vi.fn(async (id) => { items = items.filter((item) => item.id !== id); }),
  };
}
