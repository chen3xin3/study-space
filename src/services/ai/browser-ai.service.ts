import { AiServiceError } from "./ai.errors";
import type { AiService, OrganizePhotoMaterialInput, OrganizeTextMaterialInput, RecognizeEssayImagesInput, ReviewEssayInput, UpdateAiSettingsInput } from "./ai.types";

export class BrowserAiService implements AiService {
  getSettings(): Promise<never> { return this.settingsReject(); }
  updateSettings(_input: UpdateAiSettingsInput): Promise<never> { return this.settingsReject(); }
  setApiKey(_key: string): Promise<never> { return this.settingsReject(); }
  deleteApiKey(): Promise<never> { return this.settingsReject(); }
  testConnection(): Promise<never> { return this.settingsReject(); }
  reviewEssay(_input: ReviewEssayInput): Promise<never> { return this.reviewReject(); }
  recognizeEssayImages(_input: RecognizeEssayImagesInput): Promise<never> {
    return Promise.reject(new AiServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中识别作文照片。"));
  }
  organizeTextMaterial(_input: OrganizeTextMaterialInput): Promise<never> { return this.organizeReject(); }
  organizePhotoMaterial(_input: OrganizePhotoMaterialInput): Promise<never> { return this.organizeReject(); }
  retryReview(_id: string): Promise<never> { return this.reviewReject(); }
  getReview(_id: string): Promise<never> { return this.reviewReject(); }
  confirmReview(_id: string, _version: number): Promise<never> { return this.reviewReject(); }
  private settingsReject(): Promise<never> {
    return Promise.reject(new AiServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中设置 AI。"));
  }
  private reviewReject(): Promise<never> {
    return Promise.reject(new AiServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中使用 AI 批改。"));
  }
  private organizeReject(): Promise<never> {
    return Promise.reject(new AiServiceError("DESKTOP_ONLY", "请在安装版中使用 AI 整理资料。"));
  }
}
