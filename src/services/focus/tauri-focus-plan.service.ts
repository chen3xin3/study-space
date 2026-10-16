import { invoke } from "@tauri-apps/api/core";
import type { VersionedIdInput } from "../dashboard/dashboard.types";
import type { CreateFocusPlanInput, FocusPlan, FocusPlanService, SetFocusPlanCompletedInput, UpdateFocusPlanInput } from "./focus.types";

export class TauriFocusPlanService implements FocusPlanService {
  list(localDate: string) { return invoke<FocusPlan[]>("list_focus_plans", { localDate }); }
  create(input: CreateFocusPlanInput) { return invoke<FocusPlan>("create_focus_plan", { input }); }
  update(input: UpdateFocusPlanInput) { return invoke<FocusPlan>("update_focus_plan", { input }); }
  setCompleted(input: SetFocusPlanCompletedInput) { return invoke<FocusPlan>("set_focus_plan_completed", { input }); }
  delete(input: VersionedIdInput) { return invoke<void>("delete_focus_plan", { input }); }
  reorder(localDate: string, orderedIds: string[]) { return invoke<FocusPlan[]>("reorder_focus_plans", { input: { localDate, orderedIds } }); }
}
