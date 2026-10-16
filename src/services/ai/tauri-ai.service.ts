import { invoke } from "@tauri-apps/api/core";
import { toAiServiceError } from "./ai.errors";
import type {
  AiService, ConnectionTestResult, EssayAiReview, EssayImageRecognition,
  MaterialOrganizationSuggestion, OrganizePhotoMaterialInput, OrganizeTextMaterialInput,
  PhotoOrganizationSuggestion, RecognizeEssayImagesInput, ReviewEssayInput,
  SafeAiSettings, UpdateAiSettingsInput,
} from "./ai.types";

export class TauriAiService implements AiService {
  getSettings() { return this.run(() => invoke<SafeAiSettings>("get_ai_settings")); }
  updateSettings(input: UpdateAiSettingsInput) {
    return this.run(() => invoke<SafeAiSettings>("update_ai_settings", { input }));
  }
  setApiKey(apiKey: string) {
    return this.run(() => invoke<SafeAiSettings>("set_ai_api_key", { apiKey }));
  }
  deleteApiKey() {
    return this.run(() => invoke<SafeAiSettings>("delete_ai_api_key"));
  }
  testConnection() {
    return this.run(() => invoke<ConnectionTestResult>("test_ai_connection"));
  }
  reviewEssay(input: ReviewEssayInput) {
    return this.run(() => invoke<EssayAiReview>("review_essay", { input }));
  }
  recognizeEssayImages(input: RecognizeEssayImagesInput) {
    return this.run(() => invoke<EssayImageRecognition>("recognize_essay_images", { input }));
  }
  organizeTextMaterial(input: OrganizeTextMaterialInput) {
    return this.run(() => invoke<MaterialOrganizationSuggestion>("organize_text_material", { input }));
  }
  organizePhotoMaterial(input: OrganizePhotoMaterialInput) {
    return this.run(() => invoke<PhotoOrganizationSuggestion>("organize_photo_material", { input }));
  }
  retryReview(requestId: string) {
    return this.run(() => invoke<EssayAiReview>("retry_ai_review", { requestId }));
  }
  getReview(reviewId: string) {
    return this.run(() => invoke<EssayAiReview>("get_ai_review", { reviewId }));
  }
  confirmReview(reviewId: string, version: number) {
    return this.run(() => invoke<EssayAiReview>("confirm_ai_review", { reviewId, version }));
  }
  private async run<T>(operation: () => Promise<T>) {
    try { return await operation(); } catch (error) { throw toAiServiceError(error); }
  }
}
