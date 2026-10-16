import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserAiService } from "./browser-ai.service";
import { toAiServiceError } from "./ai.errors";
import { TauriAiService } from "./tauri-ai.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("TauriAiService", () => {
  const service = new TauriAiService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({});
  });

  it("passes only safe settings and exact review payloads", async () => {
    await service.setApiKey("secret");
    expect(invoke).toHaveBeenLastCalledWith("set_ai_api_key", { apiKey: "secret" });

    const input = {
      attemptId: "attempt-1",
      confirmedAttachmentIds: ["image-1"],
      retryOf: null,
    };
    await service.reviewEssay(input);
    expect(invoke).toHaveBeenLastCalledWith("review_essay", { input });

    const recognitionInput = { attachmentIds: ["image-1"] };
    await service.recognizeEssayImages(recognitionInput);
    expect(invoke).toHaveBeenLastCalledWith("recognize_essay_images", { input: recognitionInput });

    const materialInput = {
      subject: "math" as const,
      collection: "notes-examples",
      kind: "note" as const,
      title: "极限",
      content: "极限计算",
      answer: "",
      source: "高数教材",
      tags: ["高数"],
    };
    await service.organizeTextMaterial(materialInput);
    expect(invoke).toHaveBeenLastCalledWith("organize_text_material", { input: materialInput });

    await service.organizePhotoMaterial({ attachmentId: "photo-1" });
    expect(invoke).toHaveBeenLastCalledWith("organize_photo_material", {
      input: { attachmentId: "photo-1" },
    });
  });
});

it("browser preview rejects AI writes and reviews", async () => {
  const service = new BrowserAiService();
  await expect(
    service.reviewEssay({
      attemptId: "attempt-1",
      confirmedAttachmentIds: [],
      retryOf: null,
    }),
  ).rejects.toThrow("请在 Windows 桌面版中使用 AI 批改。");
  await expect(service.setApiKey("secret")).rejects.toThrow(
    "请在 Windows 桌面版中设置 AI。",
  );
  await expect(service.recognizeEssayImages({ attachmentIds: ["image-1"] })).rejects.toThrow(
    "请在 Windows 桌面版中识别作文照片。",
  );
  await expect(service.organizeTextMaterial({
    subject: "politics",
    collection: "knowledge",
    kind: "note",
    title: "毛中特",
    content: "资料",
    answer: "",
    source: "",
    tags: [],
  })).rejects.toThrow("请在安装版中使用 AI 整理资料。");
  await expect(service.organizePhotoMaterial({ attachmentId: "image-1" }))
    .rejects.toThrow("请在安装版中使用 AI 整理资料。");
});

it("uses generic wording for invalid AI results", () => {
  expect(toAiServiceError({ code: "AI_RESPONSE_INVALID" }).message)
    .toBe("AI 返回的结果格式不正确，请重试。");
});
