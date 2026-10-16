import { invoke } from "@tauri-apps/api/core";
import type { InboxFile, InboxFolder, InboxItem, InboxService } from "./inbox.types";
export class TauriInboxService implements InboxService {
  listFolders() { return invoke<InboxFolder[]>("list_inbox_folders"); }
  createFolder(name: string) { return invoke<InboxFolder>("create_inbox_folder", { name }); }
  renameFolder(input: { id: string; version: number; name: string }) { return invoke<void>("rename_inbox_folder", { input }); }
  listItems(folderId: string | null, trash: boolean, offset = 0) { return invoke<InboxItem[]>("list_inbox_items", { folderId, trash, offset }); }
  createNote(input: { title: string; note: string; folderId: string | null }) { return invoke<void>("create_inbox_note", { input }); }
  importFile(input: { name: string; bytes: number[]; folderId: string | null }) { return invoke<void>("import_inbox_file", { input }); }
  moveItem(input: { id: string; version: number; folderId: string | null }) { return invoke<void>("move_inbox_item", { input }); }
  setDeleted(input: { id: string; version: number }, deleted: boolean) { return invoke<void>("set_inbox_item_deleted", { input, deleted }); }
  readFile(itemId: string) { return invoke<InboxFile>("read_inbox_file", { itemId }); }
}
