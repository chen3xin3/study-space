import type { LearningItemKind, LearningSubject } from "../learning-items/learning-item.types";
import type { PhotoKind } from "../photo-archive/photo-archive.types";

export interface SafeAiSettings {
  enabled: boolean;
  providerName: string;
  apiUrl: string;
  model: string;
  hasApiKey: boolean;
  version: number;
}
export interface UpdateAiSettingsInput {
  enabled: boolean;
  providerName: string;
  apiUrl: string;
  model: string;
  version: number;
}
export interface ReviewIssue {
  original: string;
  suggestion: string;
  explanation: string;
}
export interface SentenceSuggestion {
  original: string;
  revised: string;
  explanation: string;
}
export interface ExpressionSuggestion { expression: string; explanation: string }
export interface EssayAiReview {
  id: string;
  requestId: string;
  attemptId: string;
  referenceScore: number | null;
  maxScore: number | null;
  rationale: string;
  grammarIssues: ReviewIssue[];
  wordingIssues: ReviewIssue[];
  contentAnalysis: string;
  sentenceSuggestions: SentenceSuggestion[];
  optimizedEssay: string;
  expressions: ExpressionSuggestion[];
  recognizedText: string | null;
  providerName: string;
  model: string;
  confirmedAt: string | null;
  createdAt: string;
  version: number;
}
export interface ReviewEssayInput {
  attemptId: string;
  confirmedAttachmentIds: string[];
  retryOf: string | null;
}
export interface RecognizeEssayImagesInput { attachmentIds: string[] }
export interface EssayImageRecognition {
  title: string;
  body: string;
  translation: string | null;
}
export interface ConnectionTestResult {
  providerName: string;
  model: string;
  reachable: boolean;
}
export interface OrganizeTextMaterialInput {
  subject: LearningSubject;
  collection: string;
  kind: LearningItemKind;
  title: string;
  content: string;
  answer: string;
  source: string;
  tags: string[];
}
export interface OrganizePhotoMaterialInput { attachmentId: string }
export interface MaterialOrganizationSuggestion {
  title: string;
  subject: LearningSubject;
  collection: string;
  kind: LearningItemKind;
  tags: string[];
  summary: string;
  keyPoints: string[];
}
export interface PhotoOrganizationSuggestion {
  title: string;
  kind: PhotoKind;
  summary: string;
}
export interface AiService {
  getSettings(): Promise<SafeAiSettings>;
  updateSettings(input: UpdateAiSettingsInput): Promise<SafeAiSettings>;
  setApiKey(apiKey: string): Promise<SafeAiSettings>;
  deleteApiKey(): Promise<SafeAiSettings>;
  testConnection(): Promise<ConnectionTestResult>;
  reviewEssay(input: ReviewEssayInput): Promise<EssayAiReview>;
  recognizeEssayImages(input: RecognizeEssayImagesInput): Promise<EssayImageRecognition>;
  organizeTextMaterial(input: OrganizeTextMaterialInput): Promise<MaterialOrganizationSuggestion>;
  organizePhotoMaterial(input: OrganizePhotoMaterialInput): Promise<PhotoOrganizationSuggestion>;
  retryReview(requestId: string): Promise<EssayAiReview>;
  getReview(reviewId: string): Promise<EssayAiReview>;
  confirmReview(reviewId: string, version: number): Promise<EssayAiReview>;
}
