export type MaterialKind = "单词" | "作文" | "错题" | "笔记" | "试卷";
export type LearningMaterial = {
  id: string; title: string; subject: string; kind: MaterialKind;
  mastery: 1 | 2 | 3 | 4 | 5; favorite: boolean;
  version: number; createdAt: string; updatedAt: string; deletedAt: string | null;
};
export type MaterialDraft = Pick<LearningMaterial, "title" | "subject" | "kind" | "mastery" | "favorite">;
export type MaterialFilters = { query: string; subject: string; favoriteOnly: boolean; mode: "active" | "trash" };

export function createMaterial(draft: MaterialDraft, now = new Date()): LearningMaterial {
  const title = draft.title.trim();
  const subject = draft.subject.trim();
  if (!title || !subject || draft.mastery < 1 || draft.mastery > 5) throw new Error("资料字段不完整");
  return {
    ...draft, title, subject, id: String(now.getTime()) + "-" + title,
    version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), deletedAt: null,
  };
}

export function filterMaterials(items: LearningMaterial[], filters: MaterialFilters): LearningMaterial[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const matchesMode = filters.mode === "trash" ? Boolean(item.deletedAt) : !item.deletedAt;
    const matchesSubject = filters.subject === "全部" || item.subject === filters.subject;
    const matchesQuery = !query || (item.title + " " + item.subject + " " + item.kind).toLocaleLowerCase().includes(query);
    return matchesMode && matchesSubject && matchesQuery && (!filters.favoriteOnly || item.favorite);
  });
}

export function updateMaterial(items: LearningMaterial[], id: string, expectedVersion: number, patch: Partial<MaterialDraft>, now = new Date()): LearningMaterial[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    if (item.version !== expectedVersion) throw new Error("资料已在其他位置更新");
    return { ...item, ...patch, version: item.version + 1, updatedAt: now.toISOString() };
  });
}

export function trashMaterial(items: LearningMaterial[], id: string, now = new Date()): LearningMaterial[] {
  return items.map((item) => item.id === id ? { ...item, deletedAt: now.toISOString(), version: item.version + 1 } : item);
}

export function restoreMaterial(items: LearningMaterial[], id: string): LearningMaterial[] {
  return items.map((item) => item.id === id ? { ...item, deletedAt: null, version: item.version + 1 } : item);
}
