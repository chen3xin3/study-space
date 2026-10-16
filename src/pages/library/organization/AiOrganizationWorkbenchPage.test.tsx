import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AiServiceError } from "../../../services/ai/ai.errors";
import type { AiService } from "../../../services/ai/ai.types";
import type { LearningItem, LearningItemService } from "../../../services/learning-items/learning-item.types";
import type { PhotoArchiveService, PhotoRecord } from "../../../services/photo-archive/photo-archive.types";
import { AiOrganizationWorkbenchPage } from "./AiOrganizationWorkbenchPage";

const learning: LearningItem = { id: "item-1", subject: "math", collection: "wrong-questions", kind: "question", title: "极限错题", content: "求极限", answer: "答案", tags: ["高数"], mastery: "learning", source: "试卷", score: null, maxScore: null, reviewAt: null, favorite: false, lastOpenedAt: "2026-10-10", createdAt: "2026-10-09", updatedAt: "2026-10-10", deletedAt: null, version: 3 };
const photo: PhotoRecord = { attachmentId: "photo-1", studyDate: "2026-10-08", studyDateConfirmed: true, title: "英语试卷", kind: "english", memorized: true, originalName: "paper.jpg", mediaType: "image/jpeg", createdAt: "2026-10-08", updatedAt: "2026-10-10", deletedAt: null, version: 2 };

function services() {
  const learningService = { list: vi.fn().mockResolvedValue([learning]), update: vi.fn().mockImplementation(async (input) => ({ ...learning, ...input, version: 4 })) } as unknown as LearningItemService;
  const photoService = { list: vi.fn().mockResolvedValue({ items: [photo], nextCursor: null }), update: vi.fn().mockImplementation(async (input) => ({ ...photo, ...input, version: 3 })) } as unknown as PhotoArchiveService;
  const aiService = {
    organizeTextMaterial: vi.fn().mockResolvedValue({ title: "整理后的极限错题", subject: "math", collection: "wrong-questions", kind: "question", tags: ["高数", "极限"], summary: "极限方法整理", keyPoints: ["先判断型"] }),
    organizePhotoMaterial: vi.fn().mockResolvedValue({ title: "英语一试卷", kind: "english", summary: "包含阅读和作文" }),
  } as unknown as AiService;
  return { learningService, photoService, aiService };
}

describe("AiOrganizationWorkbenchPage", () => {
  it("processes selected learning records and photos strictly one at a time", async () => {
    const api = services();
    render(<MemoryRouter><AiOrganizationWorkbenchPage {...api} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 极限错题" }));
    fireEvent.click(screen.getByRole("tab", { name: "学习照片" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 英语试卷" }));
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));
    await waitFor(() => expect(api.aiService.organizeTextMaterial).toHaveBeenCalledTimes(1));
    expect(api.aiService.organizePhotoMaterial).not.toHaveBeenCalled();
    expect(api.learningService.update).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "应用所选建议" }));
    await waitFor(() => expect(api.learningService.update).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1", version: 3, title: "整理后的极限错题" })));
    await waitFor(() => expect(api.aiService.organizePhotoMaterial).toHaveBeenCalledWith({ attachmentId: "photo-1" }));
    fireEvent.click(await screen.findByRole("button", { name: "应用所选建议" }));
    await waitFor(() => expect(api.photoService.update).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: "photo-1", version: 2, studyDate: "2026-10-08", memorized: true, title: "英语一试卷" })));
    expect(api.photoService.update).not.toHaveBeenCalledWith(expect.objectContaining({ summary: expect.anything() }));
    expect(await screen.findByText("本轮整理完成")).toBeInTheDocument();
  });

  it("offers retry, skip and AI settings without mutating the record on provider failure", async () => {
    const api = services();
    vi.mocked(api.aiService.organizeTextMaterial).mockRejectedValue(new AiServiceError("AI_NOT_CONFIGURED", "请先完整填写 AI 设置并保存密钥。"));
    render(<MemoryRouter><AiOrganizationWorkbenchPage {...api} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 极限错题" }));
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));
    expect(await screen.findByRole("link", { name: "前往 AI 设置" })).toHaveAttribute("href", "/settings#ai-assistant");
    expect(screen.getByRole("button", { name: "重试这条" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "跳过这条" }));
    expect(api.learningService.update).not.toHaveBeenCalled();
    expect(await screen.findByText("本轮整理完成")).toBeInTheDocument();
  });
});
