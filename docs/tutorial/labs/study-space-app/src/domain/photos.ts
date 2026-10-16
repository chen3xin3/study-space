export type ObjectUrlAdapter = { create(file: File): string; revoke(url: string): void };
export type PhotoRecord = {
  id: string; originalName: string; mime: string; byteSize: number;
  capturedDate: string; category: string; previewUrl: string; deletedAt: string | null;
};

const supportedMime = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createPhotoRecord(file: File, capturedDate: string, category: string, urls: ObjectUrlAdapter, maxBytes = 10 * 1024 * 1024): PhotoRecord {
  if (!supportedMime.has(file.type)) throw new Error("只支持 JPG、PNG 和 WebP 图片");
  if (file.size > maxBytes) throw new Error("图片超过大小限制");
  if (!capturedDate || !category.trim()) throw new Error("日期和分类不能为空");
  return {
    id: String(Date.now()) + "-" + file.name,
    originalName: file.name,
    mime: file.type,
    byteSize: file.size,
    capturedDate,
    category: category.trim(),
    previewUrl: urls.create(file),
    deletedAt: null,
  };
}

export function trashPhoto(items: PhotoRecord[], id: string, now = new Date()): PhotoRecord[] {
  return items.map((item) => item.id === id ? { ...item, deletedAt: now.toISOString() } : item);
}
export function restorePhoto(items: PhotoRecord[], id: string): PhotoRecord[] {
  return items.map((item) => item.id === id ? { ...item, deletedAt: null } : item);
}
export function permanentlyRemovePhoto(items: PhotoRecord[], id: string, confirmed: boolean, urls: ObjectUrlAdapter): PhotoRecord[] {
  if (!confirmed) throw new Error("永久删除需要明确确认");
  const target = items.find((item) => item.id === id);
  if (target) urls.revoke(target.previewUrl);
  return items.filter((item) => item.id !== id);
}
