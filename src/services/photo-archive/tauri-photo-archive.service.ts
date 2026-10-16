import { invoke } from "@tauri-apps/api/core";
import type { ImportPhotoInput, PermanentDeletePhotoResult, PhotoArchiveService, PhotoImage, PhotoListPage, PhotoListQuery, PhotoMutationInput, PhotoRecord, SetPhotoDeletedInput, UpdatePhotoInput } from "./photo-archive.types";

export class TauriPhotoArchiveService implements PhotoArchiveService {
  list({ kind, trash, cursor }: PhotoListQuery) {
    return invoke<PhotoListPage>("list_study_photos", { kind, trash, cursor, limit: 24 });
  }
  importPhoto(input: ImportPhotoInput) {
    return invoke<PhotoRecord>("import_study_photo", { input });
  }
  update(input: UpdatePhotoInput) {
    return invoke<PhotoRecord>("update_study_photo", { input });
  }
  read(attachmentId: string) {
    return invoke<PhotoImage>("read_study_photo", { attachmentId });
  }
  setDeleted(input: SetPhotoDeletedInput) {
    return invoke<PhotoRecord>("set_study_photo_deleted", { input });
  }
  deletePermanently(input: PhotoMutationInput) {
    return invoke<PermanentDeletePhotoResult>("delete_study_photo_permanently", { input });
  }
}
