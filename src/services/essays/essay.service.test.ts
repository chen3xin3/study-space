import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserEssayService } from "./browser-essay.service";
import { TauriEssayService } from "./tauri-essay.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("TauriEssayService", () => {
  const service = new TauriEssayService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({});
  });

  it("uses the exact desktop command envelopes", async () => {
    const input = {
      title: "建议信",
      body: "Dear Sir or Madam,",
      translation: null,
      examTrack: "english_1" as const,
      essayType: "small" as const,
      source: null,
      note: null,
      category: "书信",
      expressions: [],
      tags: ["模板"],
    };
    await service.createEssay(input);
    expect(invoke).toHaveBeenLastCalledWith("create_essay", { input });

    await service.getEssay("essay-1");
    expect(invoke).toHaveBeenLastCalledWith("get_essay", { essayId: "essay-1" });

    await service.deleteEssays(["essay-1"]);
    expect(invoke).toHaveBeenLastCalledWith("delete_essays", {
      essayIds: ["essay-1"],
    });

    await service.listAttempts(null, 20);
    expect(invoke).toHaveBeenLastCalledWith("list_essay_attempts", {
      cursor: null,
      limit: 20,
    });

    await service.createImportDraft();
    expect(invoke).toHaveBeenLastCalledWith("create_essay_import_draft");

    await service.getImportDraft("draft-1");
    expect(invoke).toHaveBeenLastCalledWith("get_essay_import_draft", { draftId: "draft-1" });

    await service.listImportDrafts();
    expect(invoke).toHaveBeenLastCalledWith("list_essay_import_drafts");

    await service.addImportDraftImage("draft-1", 1, [1, 2, 3], "image/png");
    expect(invoke).toHaveBeenLastCalledWith("add_essay_import_draft_image", {
      draftId: "draft-1", version: 1, bytes: [1, 2, 3], mediaType: "image/png",
    });

    await service.removeImportDraftImage("draft-1", 2, "attachment-1");
    expect(invoke).toHaveBeenLastCalledWith("remove_essay_import_draft_image", {
      draftId: "draft-1", version: 2, attachmentId: "attachment-1",
    });

    const draftInput = {
      id: "draft-1", version: 3, stage: "review" as const, title: "作文",
      body: "Body", translation: "翻译", examTrack: "english_1" as const,
      essayType: "small" as const, lastError: null,
    };
    await service.updateImportDraft(draftInput);
    expect(invoke).toHaveBeenLastCalledWith("update_essay_import_draft", { input: draftInput });

    await service.completeImportDraft(draftInput);
    expect(invoke).toHaveBeenLastCalledWith("complete_essay_import_draft", { input: draftInput });

    await service.abandonImportDraft("draft-1", 4);
    expect(invoke).toHaveBeenLastCalledWith("abandon_essay_import_draft", { draftId: "draft-1", version: 4 });
  });
});

it("browser preview never pretends an essay was saved", async () => {
  const service = new BrowserEssayService();
  await expect(
    service.createEssay({
      title: "预览",
      body: "Preview",
      translation: null,
      examTrack: null,
      essayType: "custom",
      source: null,
      note: null,
      category: null,
      expressions: [],
      tags: [],
    }),
  ).rejects.toThrow("请在 Windows 桌面版中保存作文。");
});

it("browser preview keeps essay import draft metadata across service instances", async () => {
  localStorage.clear();
  const first = new BrowserEssayService();
  const created = await first.createImportDraft();
  const updated = await first.updateImportDraft({
    id: created.id,
    version: created.version,
    stage: "review",
    title: "建议信",
    body: "Dear Sir or Madam,",
    translation: "尊敬的先生或女士",
    examTrack: "english_1",
    essayType: "small",
    lastError: null,
  });

  const reopened = await new BrowserEssayService().getImportDraft(created.id);
  expect(reopened).toEqual(updated);
  expect(await new BrowserEssayService().listImportDrafts()).toEqual([updated]);
});
