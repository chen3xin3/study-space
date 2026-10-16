export interface InboxFolder { id: string; name: string; version: number; itemCount: number }
export interface InboxItem { id: string; folderId: string | null; attachmentId: string | null; title: string; note: string; kind: "image" | "document" | "note"; originalName: string | null; mediaType: string | null; byteSize: number | null; createdAt: string; deletedAt: string | null; version: number }
export interface InboxFile { bytes: number[]; mediaType: string; name: string }
export interface InboxService {
  listFolders(): Promise<InboxFolder[]>;
  createFolder(name: string): Promise<InboxFolder>;
  renameFolder(input: { id: string; version: number; name: string }): Promise<void>;
  listItems(folderId: string | null, trash: boolean, offset?: number): Promise<InboxItem[]>;
  createNote(input: { title: string; note: string; folderId: string | null }): Promise<void>;
  importFile(input: { name: string; bytes: number[]; folderId: string | null }): Promise<void>;
  moveItem(input: { id: string; version: number; folderId: string | null }): Promise<void>;
  setDeleted(input: { id: string; version: number }, deleted: boolean): Promise<void>;
  readFile(itemId: string): Promise<InboxFile>;
}
