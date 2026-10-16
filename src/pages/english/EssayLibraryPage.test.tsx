import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { EssayService } from "../../services/essays/essay.types";
import { EssayEditorPage } from "./EssayEditorPage";

describe("EssayEditorPage", () => {
  it("edits a saved photo-imported essay", async () => {
    const updateEssay = vi.fn().mockResolvedValue({ id: "essay-1" });
    const service = {
      getEssay: vi.fn().mockResolvedValue({
        id: "essay-1", title: "建议信", body: "Dear Sir or Madam,", translation: null,
        examTrack: null, essayType: "custom", source: "照片识别", note: null, category: null,
        expressions: [], tags: [], createdAt: "now", updatedAt: "now", deletedAt: null, version: 1,
      }),
      updateEssay,
    } as unknown as EssayService;
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/english/essays/essay-1"]}>
        <Routes>
          <Route
            path="/english/essays/:essayId"
            element={<EssayEditorPage service={service} />}
          />
          <Route path="/english/essays" element={<div>范文库</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const title = await screen.findByLabelText("标题");
    await user.clear(title);
    await user.type(title, "建议信（修正版）");
    await user.click(screen.getByRole("button", { name: "保存范文" }));

    expect(updateEssay).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "essay-1",
        version: 1,
        title: "建议信（修正版）",
        body: "Dear Sir or Madam,",
      }),
    );
  });
});

describe("EssayLibraryPage", () => {
  it("groups its search and filters in a labelled search region", async () => {
    const { EssayLibraryPage } = await import("./EssayLibraryPage");
    const service = {
      listEssays: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getSummary: vi.fn().mockResolvedValue(null),
      listImportDrafts: vi.fn().mockResolvedValue([]),
    } as unknown as EssayService;
    render(<MemoryRouter><EssayLibraryPage service={service} /></MemoryRouter>);
    expect(screen.getByRole("search", { name: "筛选范文" })).toBeInTheDocument();
  });

  it("lists pending import drafts separately without counting them as saved essays", async () => {
    const { EssayLibraryPage } = await import("./EssayLibraryPage");
    const service = {
      listEssays: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getSummary: vi.fn().mockResolvedValue({ essayCount: 0, writingCount: 0, draftCount: 0, lastAiReviewAt: null }),
      listImportDrafts: vi.fn().mockResolvedValue([
        {
          id: "draft-failed", stage: "failed", title: "", body: "", translation: "",
          examTrack: null, essayType: "custom", attachmentIds: ["photo-1", "photo-2"],
          lastError: "AI unavailable", createdAt: "now", updatedAt: "now", version: 3,
        },
        {
          id: "draft-review", stage: "review", title: "建议信", body: "Dear Sir", translation: "",
          examTrack: "english_1", essayType: "small", attachmentIds: ["photo-3"],
          lastError: null, createdAt: "now", updatedAt: "now", version: 2,
        },
      ]),
    } as unknown as EssayService;

    render(<MemoryRouter><EssayLibraryPage service={service} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "待处理草稿" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /识别失败，可重试.*2 张照片/ })).toHaveAttribute("href", "/english/essays/import/draft-failed");
    expect(screen.getByRole("link", { name: /待核对保存.*1 张照片/ })).toHaveAttribute("href", "/english/essays/import/draft-review");
    expect(screen.getByText("还没有正式保存的范文")).toBeInTheDocument();
    expect(screen.getByText("范文收藏").nextElementSibling).toHaveTextContent("0");
    expect(screen.getByText("未完成草稿").nextElementSibling).toHaveTextContent("2");
  });
});
