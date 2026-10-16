import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoThumbnailCache } from "./photo-thumbnail-cache";

describe("PhotoThumbnailCache", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}:${Math.random()}`),
      revokeObjectURL: vi.fn(),
    });
  });

  it("reuses a loaded object URL", async () => {
    const cache = new PhotoThumbnailCache(2);
    const load = vi.fn().mockResolvedValue({ bytes: [1, 2], mediaType: "image/png" });

    const first = await cache.get("one", load);
    const second = await cache.get("one", load);

    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight read between simultaneous cards", async () => {
    const cache = new PhotoThumbnailCache(2);
    let resolve!: (value: { bytes: number[]; mediaType: string }) => void;
    const load = vi.fn(() => new Promise<{ bytes: number[]; mediaType: string }>((done) => { resolve = done; }));

    const first = cache.get("one", load);
    const second = cache.get("one", load);
    resolve({ bytes: [1], mediaType: "image/png" });

    expect(await first).toBe(await second);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("revokes the least recently used URL when the limit is exceeded", async () => {
    const cache = new PhotoThumbnailCache(2);
    const load = (value: number) => () => Promise.resolve({ bytes: [value], mediaType: "image/png" });
    const first = await cache.get("one", load(1));
    await cache.get("two", load(2));
    await cache.get("one", load(1));
    await cache.get("three", load(3));

    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
