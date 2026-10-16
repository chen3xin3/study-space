import { EssayServiceError } from "./essay.errors";
import type {
  CreateAttemptInput, CreateEssayInput, EssayImportDraft, EssayListQuery, EssayService,
  UpdateAttemptInput, UpdateEssayImportDraftInput, UpdateEssayInput,
} from "./essay.types";

const DRAFTS_KEY = "study-space-essay-import-drafts-v1";

function readDrafts(): EssayImportDraft[] {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as EssayImportDraft[]; }
  catch { return []; }
}

function writeDrafts(drafts: EssayImportDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export class BrowserEssayService implements EssayService {
  createEssay(_input: CreateEssayInput): Promise<never> { return this.reject(); }
  getEssay(_essayId: string): Promise<never> { return this.reject(); }
  listEssays(_query: EssayListQuery) {
    return Promise.resolve({ items: [], nextCursor: null });
  }
  updateEssay(_input: UpdateEssayInput): Promise<never> { return this.reject(); }
  deleteEssays(_ids: string[]): Promise<never> { return this.reject(); }
  createAttempt(_input: CreateAttemptInput): Promise<never> { return this.reject(); }
  getAttempt(_id: string): Promise<never> { return this.reject(); }
  updateAttempt(_input: UpdateAttemptInput): Promise<never> { return this.reject(); }
  completeAttempt(_id: string, _version: number): Promise<never> { return this.reject(); }
  copyAttempt(_id: string, _title: string): Promise<never> { return this.reject(); }
  listAttempts(_cursor: string | null, _limit: number): Promise<never> { return this.reject(); }
  compareDictation(_expected: string, _actual: string): Promise<never> { return this.reject(); }
  getSummary() {
    return Promise.resolve({
      essayCount: 0,
      draftCount: 0,
      writingCount: 0,
      lastAiReviewAt: null,
    });
  }
  async createImportDraft() {
    const now = new Date().toISOString();
    const draft: EssayImportDraft = {
      id: crypto.randomUUID(), stage: "draft", title: "", body: "", translation: "",
      examTrack: null, essayType: "custom", attachmentIds: [], lastError: null,
      createdAt: now, updatedAt: now, version: 1,
    };
    writeDrafts([draft, ...readDrafts()]);
    return draft;
  }
  async getImportDraft(draftId: string) {
    const draft = readDrafts().find((item) => item.id === draftId);
    if (!draft) throw new EssayServiceError("ESSAY_NOT_FOUND", "没有找到这份导入草稿。");
    return draft;
  }
  async listImportDrafts() { return readDrafts(); }
  addImportDraftImage(_draftId: string, _version: number, _bytes: number[], _mediaType: string): Promise<never> { return this.reject(); }
  removeImportDraftImage(_draftId: string, _version: number, _attachmentId: string): Promise<never> { return this.reject(); }
  async updateImportDraft(input: UpdateEssayImportDraftInput) {
    const drafts = readDrafts();
    const index = drafts.findIndex((item) => item.id === input.id && item.version === input.version);
    if (index < 0) throw new EssayServiceError("ESSAY_VERSION_CONFLICT", "草稿已发生变化，请重新读取。");
    const updated: EssayImportDraft = {
      ...drafts[index], ...input, updatedAt: new Date().toISOString(), version: input.version + 1,
    };
    drafts[index] = updated;
    writeDrafts(drafts);
    return updated;
  }
  async abandonImportDraft(draftId: string, version: number) {
    const drafts = readDrafts();
    const index = drafts.findIndex((item) => item.id === draftId && item.version === version);
    if (index < 0) throw new EssayServiceError("ESSAY_VERSION_CONFLICT", "草稿已发生变化，请重新读取。");
    drafts.splice(index, 1);
    writeDrafts(drafts);
  }
  completeImportDraft(_input: UpdateEssayImportDraftInput): Promise<never> { return this.reject(); }
  private reject(): Promise<never> {
    return Promise.reject(new EssayServiceError("DESKTOP_ONLY", "请在 Windows 桌面版中保存作文。"));
  }
}
