import type { PhotoImage } from "../../services/photo-archive/photo-archive.types";

export class PhotoThumbnailCache {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly limit = 48) {}

  async get(attachmentId: string, load: () => Promise<PhotoImage>): Promise<string> {
    const cached = this.urls.get(attachmentId);
    if (cached) {
      this.urls.delete(attachmentId);
      this.urls.set(attachmentId, cached);
      return cached;
    }
    const inFlight = this.pending.get(attachmentId);
    if (inFlight) return inFlight;

    const request = load().then((image) => {
      const bytes = new Uint8Array(image.bytes);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: image.mediaType }));
      this.urls.set(attachmentId, url);
      this.evictOverflow();
      return url;
    }).finally(() => {
      this.pending.delete(attachmentId);
    });
    this.pending.set(attachmentId, request);
    return request;
  }

  clear() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  private evictOverflow() {
    while (this.urls.size > this.limit) {
      const oldest = this.urls.entries().next().value as [string, string] | undefined;
      if (!oldest) return;
      this.urls.delete(oldest[0]);
      URL.revokeObjectURL(oldest[1]);
    }
  }
}

export const photoThumbnailCache = new PhotoThumbnailCache();

