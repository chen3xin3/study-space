import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import type { EssayService } from "../../services/essays/essay.types";
import type { PhotoArchiveService } from "../../services/photo-archive/photo-archive.types";
import { EssayEditorPage } from "./EssayEditorPage";

it("shows the original photo attached to a recognized essay", async () => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:source") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const essays = { getEssay: vi.fn().mockResolvedValue({
    id: "essay-1", title: "My essay", body: "Dear Sir", translation: null,
    examTrack: null, essayType: "custom", source: "照片识别", note: null,
    category: null, expressions: [], tags: [], sourcePhotoIds: ["photo-1"], version: 1,
  }) } as unknown as EssayService;
  const photos = { read: vi.fn().mockResolvedValue({ mediaType: "image/jpeg", bytes: [255, 216, 255] }) } as unknown as PhotoArchiveService;
  render(<MemoryRouter initialEntries={["/english/essays/essay-1"]}><Routes>
    <Route path="/english/essays/:essayId" element={<EssayEditorPage service={essays} photoService={photos} />} />
  </Routes></MemoryRouter>);
  expect(await screen.findByText("原稿照片")).toBeInTheDocument();
  expect(await screen.findByRole("img", { name: "作文原稿 1" })).toBeInTheDocument();
});
