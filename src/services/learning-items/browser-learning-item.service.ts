import type { LearningItem, LearningItemDraft, LearningItemQuery, LearningItemService } from "./learning-item.types";
import { normalizeLearningItemInput } from "./learning-item.validation";

const STORAGE_KEY = "study-space.learning-items.v1";

const matchesSearch = (item: LearningItem, search: string) => {
  const needle = search.trim().toLocaleLowerCase("zh-CN");
  if (!needle) return true;
  return [item.title, item.content, item.answer, item.source, ...item.tags]
    .join("\n")
    .toLocaleLowerCase("zh-CN")
    .includes(needle);
};

export class BrowserLearningItemService implements LearningItemService {
  constructor(private readonly storage: Storage) {}

  async list(query: LearningItemQuery): Promise<LearningItem[]> {
    const trash = query.trash ?? false;
    return this.read()
      .filter((item) => Boolean(item.deletedAt) === trash)
      .filter((item) => !query.subject || item.subject === query.subject)
      .filter((item) => !query.collection || item.collection === query.collection)
      .filter((item) => !query.kind || item.kind === query.kind)
      .filter((item) => !query.mastery || item.mastery === query.mastery)
      .filter((item) => query.favorite === undefined || item.favorite === query.favorite)
      .filter((item) => !query.search || matchesSearch(item, query.search))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(id: string): Promise<LearningItem> {
    const item = this.read().find((candidate) => candidate.id === id);
    if (!item) throw new Error("学习内容不存在");
    return item;
  }

  async create(input: LearningItemDraft): Promise<LearningItem> {
    const normalized = normalizeLearningItemInput(input);
    const now = new Date().toISOString();
    const item: LearningItem = {
      ...normalized,
      id: crypto.randomUUID(),
      favorite: false,
      lastOpenedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    };
    this.write([...this.read(), item]);
    return item;
  }

  async update(input: LearningItemDraft & { id: string; version: number }): Promise<LearningItem> {
    const normalized = normalizeLearningItemInput(input);
    return this.mutate(input.id, input.version, (item) => ({ ...item, ...normalized }));
  }

  async setFavorite(id: string, version: number, favorite: boolean): Promise<LearningItem> {
    return this.mutate(id, version, (item) => ({ ...item, favorite }));
  }

  async setDeleted(id: string, version: number, deleted: boolean): Promise<LearningItem> {
    return this.mutate(id, version, (item) => ({ ...item, deletedAt: deleted ? new Date().toISOString() : null }));
  }

  async touchOpened(id: string, version: number): Promise<LearningItem> {
    return this.mutate(id, version, (item) => ({ ...item, lastOpenedAt: new Date().toISOString() }));
  }

  async deletePermanently(id: string, version: number): Promise<void> {
    const items = this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("学习内容不存在");
    if (items[index].version !== version) throw new Error("内容已发生变化，请重新加载");
    if (!items[index].deletedAt) throw new Error("请先移入回收站");
    items.splice(index, 1);
    this.write(items);
  }

  private mutate(id: string, version: number, change: (item: LearningItem) => LearningItem): LearningItem {
    const items = this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("学习内容不存在");
    if (items[index].version !== version) throw new Error("内容已发生变化，请重新加载");
    const changed = change(items[index]);
    items[index] = { ...changed, updatedAt: new Date().toISOString(), version: version + 1 };
    this.write(items);
    return items[index];
  }

  private read(): LearningItem[] {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as LearningItem[] : [];
    } catch {
      return [];
    }
  }

  private write(items: LearningItem[]): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (cause) {
      throw new Error(cause instanceof Error ? `学习内容保存失败：${cause.message}` : "学习内容保存失败");
    }
  }
}
