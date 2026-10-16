export type PhotoKind = "english" | "essay" | "other";

export interface PhotoRecord {
  attachmentId: string;
  studyDate: string;
  studyDateConfirmed: boolean;
  title: string;
  kind: PhotoKind;
  memorized: boolean;
  originalName: string;
  mediaType: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

export interface PhotoListPage { items: PhotoRecord[]; nextCursor: string | null }
export interface PhotoListQuery { kind: PhotoKind | null; trash: boolean; cursor: string | null }
export interface ImportPhotoInput {
  bytes: number[];
  mediaType: string;
  originalName?: string;
  studyDate: string;
  title: string;
  kind: PhotoKind;
}
export interface UpdatePhotoInput {
  attachmentId: string;
  version: number;
  studyDate: string;
  title: string;
  kind: PhotoKind;
  memorized: boolean;
}
export interface PhotoImage { mediaType: string; bytes: number[] }
export interface PhotoMutationInput { attachmentId: string; version: number }
export interface SetPhotoDeletedInput extends PhotoMutationInput { deleted: boolean }
export interface PermanentDeletePhotoResult { attachmentRemoved: boolean }

export interface PhotoArchiveService {
  list(query: PhotoListQuery): Promise<PhotoListPage>;
  importPhoto(input: ImportPhotoInput): Promise<PhotoRecord>;
  update(input: UpdatePhotoInput): Promise<PhotoRecord>;
  read(attachmentId: string): Promise<PhotoImage>;
  setDeleted(input: SetPhotoDeletedInput): Promise<PhotoRecord>;
  deletePermanently(input: PhotoMutationInput): Promise<PermanentDeletePhotoResult>;
}
