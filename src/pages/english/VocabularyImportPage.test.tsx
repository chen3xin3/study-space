import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { DataService } from "../../services/data/data.types";
import type { ImportSessionDetail, VocabularyImportService } from "../../services/vocabulary-import/vocabulary-import.types";
import { VocabularyImportPage } from "./VocabularyImportPage";

const attachment = { id: "image-1", originalName: "words.png", mediaType: "image/png", byteSize: 1024, sha256: "hash", createdAt: "now" };
const session: ImportSessionDetail = { id: "session-1", status: "draft", errorCode: null, images: [], candidates: [], createdAt: "now", updatedAt: "now", completedAt: null, deletedAt: null, version: 1 };

it("requires a selected image and disclosure confirmation before recognition", async () => {
  const user = userEvent.setup();
  const data = {} as DataService;
  const imports = {
    listOpenSessions: vi.fn().mockResolvedValue([]),
    importClipboardImage: vi.fn().mockResolvedValue(attachment),
    createSession: vi.fn().mockResolvedValue(session),
    recognize: vi.fn().mockResolvedValue({ ...session, status: "reviewing", version: 2 }),
  } as unknown as VocabularyImportService;
  render(<MemoryRouter><VocabularyImportPage dataService={data} importService={imports} /></MemoryRouter>);

  const start = screen.getByRole("button", { name: "开始识别" });
  expect(start).toBeDisabled();
  const photo = new File([new Uint8Array([1, 2, 3])], "words.jpg", { type: "image/jpeg" });
  Object.defineProperty(photo, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer) });
  const gallery = document.querySelector<HTMLInputElement>('input[data-image-source="gallery"]');
  fireEvent.change(gallery!, { target: { files: [photo] } });
  expect(await screen.findByText("words.png")).toBeInTheDocument();
  expect(imports.importClipboardImage).toHaveBeenCalledWith([1, 2, 3], "image/jpeg");
  expect(start).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "我已了解并同意本次发送" }));
  expect(start).toBeEnabled();
  await user.click(start);
  expect(imports.createSession).toHaveBeenCalledWith(["image-1"]);
  expect(imports.recognize).toHaveBeenCalledWith("session-1", 1);
});

it("rejects unsupported or oversized selected images", async () => {
  const data = {} as DataService;
  const imports = { listOpenSessions: vi.fn().mockResolvedValue([]), importClipboardImage: vi.fn() } as unknown as VocabularyImportService;
  render(<MemoryRouter><VocabularyImportPage dataService={data} importService={imports} /></MemoryRouter>);
  const invalid = new File([new Uint8Array([1])], "notes.pdf", { type: "application/pdf" });
  const gallery = document.querySelector<HTMLInputElement>('input[data-image-source="gallery"]');
  fireEvent.change(gallery!, { target: { files: [invalid] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("只支持 10 MB 以内");
  expect(imports.importClipboardImage).not.toHaveBeenCalled();
});
