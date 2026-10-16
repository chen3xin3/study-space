import { invoke } from "@tauri-apps/api/core";
import type { VersionedIdInput } from "../dashboard/dashboard.types";
import type { AddInterruptionInput, CompleteFocusReviewInput, CreateFocusPresetInput, FocusHistoryItem, FocusInterruption, FocusPreset, FocusService, FocusSession, FocusSessionDetail, PhaseInput, StartFocusInput, UpdateFocusPresetInput } from "./focus.types";
export class TauriFocusService implements FocusService {
  start(input: StartFocusInput) { return invoke<FocusSession>("start_focus_session", { input }); }
  getActive() { return invoke<FocusSession | null>("get_active_focus"); }
  setPhase(input: PhaseInput) { return invoke<void>("set_focus_phase", { input }); }
  listPresets() { return invoke<FocusPreset[]>("list_focus_presets"); }
  createPreset(input: CreateFocusPresetInput) { return invoke<FocusPreset>("create_focus_preset", { input }); }
  updatePreset(input: UpdateFocusPresetInput) { return invoke<FocusPreset>("update_focus_preset", { input }); }
  deletePreset(input: VersionedIdInput) { return invoke<void>("delete_focus_preset", { input }); }
  addInterruption(input: AddInterruptionInput) { return invoke<FocusInterruption>("add_focus_interruption", { input }); }
  listInterruptions(timerId: string) { return invoke<FocusInterruption[]>("list_focus_interruptions", { timerId }); }
  completeReview(input: CompleteFocusReviewInput) { return invoke<FocusSessionDetail>("complete_focus_review", { input }); }
  getSessionDetail(timerId: string) { return invoke<FocusSessionDetail>("get_focus_session_detail", { timerId }); }
  listHistory(offset = 0) { return invoke<FocusHistoryItem[]>("list_focus_history", { offset }); }
}
