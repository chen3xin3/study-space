import { describe, expect, it } from "vitest";
import { createImportQueue, markQueueItem } from "./photo-import-queue";

describe("createImportQueue", () => {
  it("keeps valid files while reporting invalid and duplicate files", () => {
    const good = new File(["image"], "notes.png", { type: "image/png", lastModified: 1 });
    const duplicate = new File(["image"], "notes.png", { type: "image/png", lastModified: 1 });
    const invalid = new File(["text"], "notes.txt", { type: "text/plain", lastModified: 2 });

    const result = createImportQueue([good, duplicate, invalid]);

    expect(result.items.map((item) => item.status)).toEqual(["pending", "rejected", "rejected"]);
    expect(result.items[1].error).toBe("这张照片已在当前批次中");
    expect(result.items[2].error).toBe("仅支持 PNG、JPG 或 WebP 图片");
  });

  it("marks files beyond the batch limit without discarding earlier files", () => {
    const files = Array.from({ length: 5 }, (_, index) => new File([String(index)], `${index}.png`, {
      type: "image/png",
      lastModified: index,
    }));

    const result = createImportQueue(files);

    expect(result.items.slice(0, 4).every((item) => item.status === "pending")).toBe(true);
    expect(result.items[4]).toMatchObject({ status: "rejected", error: "一次最多导入 4 张照片" });
  });
});

it("updates exactly one queue item", () => {
  const file = new File(["image"], "notes.png", { type: "image/png", lastModified: 1 });
  const [item] = createImportQueue([file]).items;

  const updated = markQueueItem([item], item.id, { status: "success" });

  expect(updated[0].status).toBe("success");
  expect(updated[0].file).toBe(file);
});
