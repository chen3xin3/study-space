export type PhotoImportStatus = "pending" | "importing" | "success" | "failed" | "rejected" | "skipped";

export interface PhotoImportQueueItem {
  id: string;
  file: File;
  status: PhotoImportStatus;
  error: string;
}

const supportedMediaTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;
const maxBatch = 4;

function fileSignature(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

export function createImportQueue(files: File[]) {
  const seen = new Set<string>();
  return {
    items: files.map((file, index): PhotoImportQueueItem => {
      const signature = fileSignature(file);
      let error = "";
      if (index >= maxBatch) error = "一次最多导入 4 张照片";
      else if (!supportedMediaTypes.has(file.type)) error = "仅支持 PNG、JPG 或 WebP 图片";
      else if (file.size === 0) error = "图片内容为空";
      else if (file.size > maxBytes) error = "图片不能超过 10 MB";
      else if (seen.has(signature)) error = "这张照片已在当前批次中";
      seen.add(signature);
      return {
        id: `${signature}\u0000${index}`,
        file,
        status: error ? "rejected" : "pending",
        error,
      };
    }),
  };
}

export function markQueueItem(
  items: PhotoImportQueueItem[],
  id: string,
  patch: Partial<PhotoImportQueueItem>,
) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}
