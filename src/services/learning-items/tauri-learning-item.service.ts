import { invoke } from "@tauri-apps/api/core";
import type { LearningItem, LearningItemDraft, LearningItemQuery, LearningItemService } from "./learning-item.types";

export class TauriLearningItemService implements LearningItemService {
  list(query: LearningItemQuery) { return invoke<LearningItem[]>("list_learning_items", { query }); }
  get(id: string) { return invoke<LearningItem>("get_learning_item", { id }); }
  create(input: LearningItemDraft) { return invoke<LearningItem>("create_learning_item", { input }); }
  update(input: LearningItemDraft & { id: string; version: number }) { return invoke<LearningItem>("update_learning_item", { input }); }
  setFavorite(id: string, version: number, favorite: boolean) { return invoke<LearningItem>("set_learning_item_favorite", { id, version, favorite }); }
  setDeleted(id: string, version: number, deleted: boolean) { return invoke<LearningItem>("set_learning_item_deleted", { id, version, deleted }); }
  touchOpened(id: string, version: number) { return invoke<LearningItem>("touch_learning_item_opened", { id, version }); }
  deletePermanently(id: string, version: number) { return invoke<void>("delete_learning_item_permanently", { id, version }); }
}
