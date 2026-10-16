import type { ImportPhotoInput, PermanentDeletePhotoResult, PhotoArchiveService, PhotoImage, PhotoListPage, PhotoListQuery, PhotoMutationInput, PhotoRecord, SetPhotoDeletedInput, UpdatePhotoInput } from "./photo-archive.types";

export class BrowserPhotoArchiveService implements PhotoArchiveService {
  private unavailable(): Promise<never> {
    return Promise.reject(new Error("请在安装的应用中使用照片资料库。"));
  }
  list(_query: PhotoListQuery): Promise<PhotoListPage> { return this.unavailable(); }
  importPhoto(_input: ImportPhotoInput): Promise<PhotoRecord> { return this.unavailable(); }
  update(_input: UpdatePhotoInput): Promise<PhotoRecord> { return this.unavailable(); }
  read(_attachmentId: string): Promise<PhotoImage> { return this.unavailable(); }
  setDeleted(_input: SetPhotoDeletedInput): Promise<PhotoRecord> { return this.unavailable(); }
  deletePermanently(_input: PhotoMutationInput): Promise<PermanentDeletePhotoResult> { return this.unavailable(); }
}
