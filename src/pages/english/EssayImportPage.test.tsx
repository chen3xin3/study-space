import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import type { AiService } from "../../services/ai/ai.types";
import type { EssayImportDraft, EssayService } from "../../services/essays/essay.types";
import { EssayImportPage } from "./EssayImportPage";

function draft(changes: Partial<EssayImportDraft> = {}): EssayImportDraft {
  return {
    id: "draft-1",
    stage: "draft",
    title: "",
    body: "",
    translation: "",
    examTrack: null,
    essayType: "custom",
    attachmentIds: [],
    lastError: null,
    createdAt: "2026-10-04T08:00:00Z",
    updatedAt: "2026-10-04T08:00:00Z",
    version: 1,
    ...changes,
  };
}

function renderPage(path: string, essayService: EssayService, aiService: AiService) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/english/essays/import" element={<EssayImportPage essayService={essayService} aiService={aiService} />} />
        <Route path="/english/essays/import/:draftId" element={<EssayImportPage essayService={essayService} aiService={aiService} />} />
        <Route path="/english/essays/:essayId" element={<h1>范文详情</h1>} />
        <Route path="/english/essays" element={<h1>我的范文库</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.restoreAllMocks());

it("creates a persistent draft after the first image and completes it after review", async () => {
  const user = userEvent.setup();
  const first = draft();
  const withImage = draft({ attachmentIds: ["essay-image-1"], version: 2 });
  const reviewed = draft({
    stage: "review",
    title: "建议信",
    body: "Dear Sir or Madam,",
    attachmentIds: ["essay-image-1"],
    version: 3,
  });
  const essayService = {
    createImportDraft: vi.fn().mockResolvedValue(first),
    addImportDraftImage: vi.fn().mockResolvedValue(withImage),
    updateImportDraft: vi.fn().mockResolvedValue(reviewed),
    completeImportDraft: vi.fn().mockResolvedValue({ id: "essay-1" }),
  } as unknown as EssayService;
  const aiService = {
    getSettings: vi.fn().mockResolvedValue({ enabled: true, apiUrl: "https://ai.example.test", model: "vision", hasApiKey: true }),
    recognizeEssayImages: vi.fn().mockResolvedValue({ title: "建议信", body: "Dear Sir or Madam,", translation: null }),
  } as unknown as AiService;
  renderPage("/english/essays/import", essayService, aiService);

  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "essay.jpg", { type: "image/jpeg" });
  Object.defineProperty(photo, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]).buffer) });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[data-image-source="gallery"]')!, { target: { files: [photo] } });

  expect(await screen.findByText("已保存照片 1")).toBeInTheDocument();
  expect(essayService.createImportDraft).toHaveBeenCalledTimes(1);
  expect(essayService.addImportDraftImage).toHaveBeenCalledWith("draft-1", 1, [255, 216, 255], "image/jpeg");
  expect(screen.getByRole("button", { name: "开始识别" })).toBeDisabled();

  await user.click(screen.getByRole("checkbox", { name: "我已了解并同意本次发送" }));
  await user.click(screen.getByRole("button", { name: "开始识别" }));

  expect(aiService.getSettings).toHaveBeenCalledTimes(1);
  expect(aiService.recognizeEssayImages).toHaveBeenCalledWith({ attachmentIds: ["essay-image-1"] });
  expect(essayService.updateImportDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "draft-1", version: 2, stage: "review", title: "建议信" }));

  const body = await screen.findByLabelText("英文正文");
  await user.type(body, " Thank you.");
  await user.click(screen.getByRole("button", { name: "保存到范文库" }));

  expect(essayService.completeImportDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "draft-1", version: 3, body: "Dear Sir or Madam, Thank you." }));
  expect(await screen.findByRole("heading", { name: "范文详情" })).toBeInTheDocument();
});

it("reopens a review draft without restoring external-send consent", async () => {
  const essayService = {
    getImportDraft: vi.fn().mockResolvedValue(draft({
      stage: "review",
      title: "已识别标题",
      body: "Saved body",
      attachmentIds: ["essay-image-1"],
      version: 4,
    })),
  } as unknown as EssayService;
  renderPage("/english/essays/import/draft-1", essayService, {} as AiService);

  expect(await screen.findByDisplayValue("已识别标题")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Saved body")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "我已了解并同意本次发送" })).not.toBeInTheDocument();
  expect(essayService.getImportDraft).toHaveBeenCalledWith("draft-1");
});

it("keeps the draft and records the failure when recognition fails", async () => {
  const user = userEvent.setup();
  const openDraft = draft({ attachmentIds: ["essay-image-1"], version: 2 });
  const failedDraft = draft({ attachmentIds: ["essay-image-1"], stage: "failed", lastError: "AI 暂时不可用", version: 3 });
  const essayService = {
    getImportDraft: vi.fn().mockResolvedValue(openDraft),
    updateImportDraft: vi.fn().mockResolvedValue(failedDraft),
  } as unknown as EssayService;
  const aiService = {
    getSettings: vi.fn().mockResolvedValue({ enabled: true, apiUrl: "https://ai.example.test", model: "vision", hasApiKey: true }),
    recognizeEssayImages: vi.fn().mockRejectedValue(new Error("AI 暂时不可用")),
  } as unknown as AiService;
  renderPage("/english/essays/import/draft-1", essayService, aiService);

  await screen.findByText("已保存照片 1");
  await user.click(screen.getByRole("checkbox", { name: "我已了解并同意本次发送" }));
  await user.click(screen.getByRole("button", { name: "开始识别" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("AI 暂时不可用");
  expect(essayService.updateImportDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "draft-1", version: 2, stage: "failed", lastError: "AI 暂时不可用" }));
  expect(screen.getByText("已保存照片 1")).toBeInTheDocument();
});

it("checks AI readiness before sending and offers the settings page", async () => {
  const user = userEvent.setup();
  const essayService = { getImportDraft: vi.fn().mockResolvedValue(draft({ attachmentIds: ["essay-image-1"], version: 2 })) } as unknown as EssayService;
  const aiService = {
    getSettings: vi.fn().mockResolvedValue({ enabled: false, apiUrl: "", model: "", hasApiKey: false }),
    recognizeEssayImages: vi.fn(),
  } as unknown as AiService;
  renderPage("/english/essays/import/draft-1", essayService, aiService);

  await screen.findByText("已保存照片 1");
  await user.click(screen.getByRole("checkbox", { name: "我已了解并同意本次发送" }));
  await user.click(screen.getByRole("button", { name: "开始识别" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("请先完成 AI 设置");
  expect(screen.getByRole("link", { name: "去设置" })).toHaveAttribute("href", "/settings#ai-assistant");
  expect(aiService.recognizeEssayImages).not.toHaveBeenCalled();
});

it("abandons a draft only after confirmation", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const essayService = {
    getImportDraft: vi.fn().mockResolvedValue(draft({ attachmentIds: ["essay-image-1"], version: 2 })),
    abandonImportDraft: vi.fn().mockResolvedValue(undefined),
  } as unknown as EssayService;
  renderPage("/english/essays/import/draft-1", essayService, {} as AiService);

  await screen.findByText("已保存照片 1");
  await user.click(screen.getByRole("button", { name: "放弃草稿" }));
  expect(essayService.abandonImportDraft).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "放弃草稿" }));

  await waitFor(() => expect(essayService.abandonImportDraft).toHaveBeenCalledWith("draft-1", 2));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("heading", { name: "我的范文库" })).toBeInTheDocument();
});
