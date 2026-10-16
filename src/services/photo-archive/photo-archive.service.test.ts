import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { BrowserPhotoArchiveService } from "./browser-photo-archive.service";
import { TauriPhotoArchiveService } from "./tauri-photo-archive.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("uses the photo archive commands without invoking AI", async () => {
  vi.mocked(invoke).mockResolvedValue({ items: [], nextCursor: null });
  const service = new TauriPhotoArchiveService();
  await service.list({ kind: "english", trash: false, cursor: null });
  expect(invoke).toHaveBeenLastCalledWith("list_study_photos", { kind: "english", trash: false, cursor: null, limit: 24 });
  await service.importPhoto({ bytes: [137, 80], mediaType: "image/png", studyDate: "2020-09-27", title: "单词纸", kind: "english" });
  expect(invoke).toHaveBeenLastCalledWith("import_study_photo", { input: {
    bytes: [137, 80], mediaType: "image/png", studyDate: "2020-09-27", title: "单词纸", kind: "english",
  } });
  await service.setDeleted({ attachmentId: "photo-1", version: 2, deleted: true });
  expect(invoke).toHaveBeenLastCalledWith("set_study_photo_deleted", { input: {
    attachmentId: "photo-1", version: 2, deleted: true,
  } });
  await service.deletePermanently({ attachmentId: "photo-1", version: 3 });
  expect(invoke).toHaveBeenLastCalledWith("delete_study_photo_permanently", { input: {
    attachmentId: "photo-1", version: 3,
  } });
});

it("browser preview does not claim photos were saved", async () => {
  await expect(new BrowserPhotoArchiveService().list({ kind: null, trash: false, cursor: null }))
    .rejects.toThrow("请在安装的应用中使用照片资料库");
});
