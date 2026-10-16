import type { InboxFile, InboxFolder, InboxItem, InboxService } from "./inbox.types";
export class BrowserInboxService implements InboxService {
  private unavailable(): Promise<never> { return Promise.reject(new Error("请在安装的应用中使用资料收件箱。")); }
  listFolders(): Promise<InboxFolder[]> { return this.unavailable(); }
  createFolder(_name: string): Promise<InboxFolder> { return this.unavailable(); }
  renameFolder(_input: { id: string; version: number; name: string }): Promise<void> { return this.unavailable(); }
  listItems(_folderId: string | null, _trash: boolean, _offset = 0): Promise<InboxItem[]> { return this.unavailable(); }
  createNote(_input: { title: string; note: string; folderId: string | null }): Promise<void> { return this.unavailable(); }
  importFile(_input: { name: string; bytes: number[]; folderId: string | null }): Promise<void> { return this.unavailable(); }
  moveItem(_input: { id: string; version: number; folderId: string | null }): Promise<void> { return this.unavailable(); }
  setDeleted(_input: { id: string; version: number }, _deleted: boolean): Promise<void> { return this.unavailable(); }
  readFile(_itemId: string): Promise<InboxFile> { return this.unavailable(); }
}
