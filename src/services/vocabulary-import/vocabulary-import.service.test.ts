import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVocabularyImportService } from "./browser-vocabulary-import.service";
import { TauriVocabularyImportService } from "./tauri-vocabulary-import.service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("TauriVocabularyImportService", () => {
  const service = new TauriVocabularyImportService();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({});
  });

  it("uses the exact desktop command envelopes", async () => {
    await service.createSession(["attachment-1"]);
    expect(invoke).toHaveBeenLastCalledWith("create_vocabulary_import", { attachmentIds: ["attachment-1"] });
    await service.recognize("session-1", 1);
    expect(invoke).toHaveBeenLastCalledWith("recognize_vocabulary_import", { sessionId: "session-1", version: 1 });
    await service.rotateImage("session-1", "attachment-1", 2, 90);
    expect(invoke).toHaveBeenLastCalledWith("rotate_vocabulary_import_image", {
      sessionId: "session-1", attachmentId: "attachment-1", version: 2, rotationDegrees: 90,
    });
  });
});

it("browser preview never pretends recognition succeeded", async () => {
  await expect(new BrowserVocabularyImportService().recognize("session-1", 1))
    .rejects.toThrow("请在 Windows 桌面版中识别手写单词。");
});
