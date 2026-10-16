import { createPhotoRecord, permanentlyRemovePhoto, restorePhoto, trashPhoto, type ObjectUrlAdapter } from "./photos";

describe("learning photos", () => {
  const adapter: ObjectUrlAdapter = {
    create: vi.fn(() => "blob:preview-1"),
    revoke: vi.fn(),
  };

  it("accepts supported images and keeps date/category metadata", () => {
    const file = new File(["image"], "paper.png", { type: "image/png" });
    const photo = createPhotoRecord(file, "2026-10-15", "英语试卷", adapter);
    expect(photo).toMatchObject({ originalName: "paper.png", category: "英语试卷", capturedDate: "2026-10-15", previewUrl: "blob:preview-1" });
  });

  it("rejects unsupported MIME and oversized files", () => {
    expect(() => createPhotoRecord(new File(["text"], "note.txt", { type: "text/plain" }), "2026-10-15", "其他", adapter)).toThrow();
    expect(() => createPhotoRecord(new File([new Uint8Array(6)], "huge.jpg", { type: "image/jpeg" }), "2026-10-15", "其他", adapter, 5)).toThrow();
  });

  it("trashes, restores and revokes preview before permanent removal", () => {
    const photo = createPhotoRecord(new File(["x"], "x.jpg", { type: "image/jpeg" }), "2026-10-15", "数学错题", adapter);
    const trashed = trashPhoto([photo], photo.id)[0];
    expect(restorePhoto([trashed], photo.id)[0].deletedAt).toBeNull();
    expect(permanentlyRemovePhoto([trashed], photo.id, true, adapter)).toEqual([]);
    expect(adapter.revoke).toHaveBeenCalledWith(photo.previewUrl);
  });
});
