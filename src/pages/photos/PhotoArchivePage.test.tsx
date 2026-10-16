import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AiService } from "../../services/ai/ai.types";
import { AiServiceError } from "../../services/ai/ai.errors";
import type { PhotoArchiveService, PhotoRecord } from "../../services/photo-archive/photo-archive.types";
import { PhotoArchivePage } from "./PhotoArchivePage";

const original: PhotoRecord = {
  attachmentId: "image-1", studyDate: "2026-09-27", studyDateConfirmed: false,
  title: "旧单词纸", kind: "english", memorized: false,
  originalName: "words.png", mediaType: "image/png", createdAt: "2026-09-27T10:00:00Z",
  updatedAt: "2026-09-27T10:00:00Z", version: 1,
  deletedAt: null,
};

function service(items: PhotoRecord[] = [original]): PhotoArchiveService {
  return {
    list: vi.fn().mockResolvedValue({ items, nextCursor: null }),
    importPhoto: vi.fn().mockResolvedValue({ ...original, studyDateConfirmed: true }),
    update: vi.fn().mockImplementation(async (input) => ({ ...original, ...input, version: 2, studyDateConfirmed: true })),
    read: vi.fn().mockResolvedValue({ mediaType: "image/png", bytes: [137, 80, 78, 71] }),
    setDeleted: vi.fn().mockImplementation(async (input) => ({ ...original, deletedAt: input.deleted ? "2026-10-04T00:00:00Z" : null, version: input.version + 1 })),
    deletePermanently: vi.fn().mockResolvedValue({ attachmentRemoved: false }),
  };
}

function aiService(overrides: Partial<AiService> = {}): AiService {
  return {
    organizePhotoMaterial: vi.fn().mockResolvedValue({ title: "整理后的作文照片", kind: "essay", summary: "这是一张作文草稿，包含开头和两个论点。" }),
    ...overrides,
  } as AiService;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

it("opens the English photo archive filtered from the English resource page", async () => {
  window.history.replaceState({}, "", "/library/photos?kind=english");
  const api = service();
  render(<PhotoArchivePage service={api} />);
  await waitFor(() => expect(api.list).toHaveBeenCalledWith({ kind: "english", trash: false, cursor: null }));
  expect(screen.getByRole("button", { name: "英语" })).toHaveAttribute("aria-pressed", "true");
});

it("shows old photos by study date without pretending the date or memorization was confirmed", async () => {
  render(<PhotoArchivePage service={service()} />);
  expect(await screen.findByText("旧单词纸")).toBeInTheDocument();
  expect(screen.getByText("9月27日")).toBeInTheDocument();
  expect(screen.getByText("日期待确认")).toBeInTheDocument();
  expect(screen.queryByText("已背诵 1")).not.toBeInTheDocument();
});

it("saves a selected photo with a past study date without asking for AI consent", async () => {
  const api = service([]);
  render(<PhotoArchivePage service={api} />);
  const file = new File([new Uint8Array([137, 80, 78, 71])], "notes.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer) });
  fireEvent.change(screen.getByLabelText("从设备选择照片"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("这一批的学习日期"), { target: { value: "2020-09-27" } });
  await userEvent.setup().click(screen.getByRole("button", { name: "保存到照片资料库" }));
  expect(api.importPhoto).toHaveBeenCalledWith(expect.objectContaining({
    studyDate: "2020-09-27", title: "notes", mediaType: "image/png", kind: "other",
  }));
  expect(screen.queryByText(/同意本次发送|开始识别/)).not.toBeInTheDocument();
});

it("shows selected files beside the header and allows removing one or cancelling the batch", async () => {
  render(<PhotoArchivePage service={service([])} />);
  const first = new File([new Uint8Array([137, 80, 78, 71])], "first.png", { type: "image/png" });
  const second = new File([new Uint8Array([137, 80, 78, 71])], "second.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("从设备选择照片"), { target: { files: [first, second] } });

  expect(screen.getByRole("region", { name: "待导入照片" })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "移除 first.png" }));
  expect(screen.queryByText("first.png")).not.toBeInTheDocument();
  expect(screen.getByText("second.png")).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "取消整批" }));
  expect(screen.queryByRole("region", { name: "待导入照片" })).not.toBeInTheDocument();
});

it("allows a photo to be marked memorized by the user", async () => {
  const api = service();
  render(<PhotoArchivePage service={api} />);
  await userEvent.setup().click(await screen.findByRole("button", { name: "标记旧单词纸已背诵" }));
  expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
    attachmentId: "image-1", memorized: true, version: 1,
  }));
});

it("selects every loaded photo and moves the batch to trash", async () => {
  const second = { ...original, attachmentId: "image-2", title: "高数草稿", originalName: "math.png" };
  const api = service([original, second]);
  render(<PhotoArchivePage service={api} />);
  const user = userEvent.setup();
  await screen.findByText("旧单词纸");
  await user.click(screen.getByRole("button", { name: "批量管理" }));
  await user.click(screen.getByRole("button", { name: "全选当前照片" }));
  await user.click(screen.getByRole("button", { name: "将 2 张照片移入回收站" }));
  expect(api.setDeleted).toHaveBeenCalledTimes(2);
  expect(api.setDeleted).toHaveBeenCalledWith({ attachmentId: "image-1", version: 1, deleted: true });
  expect(api.setDeleted).toHaveBeenCalledWith({ attachmentId: "image-2", version: 1, deleted: true });
});

it("restores or permanently deletes photos from trash", async () => {
  const trashed = { ...original, deletedAt: "2026-10-04T00:00:00Z" };
  const second = { ...trashed, attachmentId: "image-2", title: "高数草稿", originalName: "math.png" };
  const api = service([]);
  vi.mocked(api.list).mockImplementation(async (query) => ({ items: query.trash ? [trashed, second] : [], nextCursor: null }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<PhotoArchivePage service={api} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "回收站" }));
  expect(await screen.findByText("旧单词纸")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "恢复旧单词纸" }));
  expect(api.setDeleted).toHaveBeenCalledWith({ attachmentId: "image-1", version: 1, deleted: false });
  await user.click(screen.getByRole("button", { name: "永久删除高数草稿" }));
  expect(api.deletePermanently).toHaveBeenCalledWith({ attachmentId: "image-2", version: 1 });
});

it("stops before starting the next queued photo", async () => {
  const api = service([]);
  let finishFirst: (() => void) | undefined;
  vi.mocked(api.importPhoto).mockImplementation(() => new Promise((resolve) => {
    finishFirst = () => resolve({ ...original, attachmentId: "saved-1", studyDateConfirmed: true });
  }));
  render(<PhotoArchivePage service={api} />);
  const first = new File(["first"], "first.png", { type: "image/png", lastModified: 1 });
  const second = new File(["second"], "second.png", { type: "image/png", lastModified: 2 });
  Object.defineProperty(first, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer) });
  Object.defineProperty(second, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([2]).buffer) });
  fireEvent.change(screen.getByLabelText("从设备选择照片"), { target: { files: [first, second] } });

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "保存到照片资料库" }));
  await user.click(await screen.findByRole("button", { name: "停止后续导入" }));
  await act(async () => finishFirst?.());

  await waitFor(() => expect(api.importPhoto).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("已停止")).toBeInTheDocument();
});

it("retries only failed photos without saving successful photos twice", async () => {
  const api = service([]);
  vi.mocked(api.importPhoto)
    .mockRejectedValueOnce(new Error("磁盘暂时不可用"))
    .mockResolvedValueOnce({ ...original, attachmentId: "saved-1", studyDateConfirmed: true });
  render(<PhotoArchivePage service={api} />);
  const file = new File(["image"], "notes.png", { type: "image/png", lastModified: 1 });
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer) });
  fireEvent.change(screen.getByLabelText("从设备选择照片"), { target: { files: [file] } });

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "保存到照片资料库" }));
  expect(await screen.findByText("磁盘暂时不可用")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试失败项" }));

  await waitFor(() => expect(api.importPhoto).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/已保存 1 张照片/)).toBeInTheDocument();
});

it("undoes the latest move to trash with the returned version", async () => {
  const api = service();
  render(<PhotoArchivePage service={api} />);
  const user = userEvent.setup();
  await screen.findByText("旧单词纸");
  await user.click(screen.getByRole("button", { name: "批量管理" }));
  await user.click(screen.getByRole("button", { name: "全选当前照片" }));
  await user.click(screen.getByRole("button", { name: "将 1 张照片移入回收站" }));

  await user.click(await screen.findByRole("button", { name: "撤销移入回收站" }));

  expect(api.setDeleted).toHaveBeenLastCalledWith({ attachmentId: "image-1", version: 2, deleted: false });
  expect(await screen.findByText("旧单词纸")).toBeInTheDocument();
});

it("changes the category of every selected photo", async () => {
  const second = { ...original, attachmentId: "image-2", title: "高数草稿", originalName: "math.png", kind: "other" as const };
  const api = service([original, second]);
  render(<PhotoArchivePage service={api} />);
  const user = userEvent.setup();
  await screen.findByText("旧单词纸");
  await user.click(screen.getByRole("button", { name: "批量管理" }));
  await user.click(screen.getByRole("button", { name: "全选当前照片" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "批量资料类型" }), "english");
  await user.click(screen.getByRole("button", { name: "应用分类" }));

  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
  expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: "image-1", kind: "english", version: 1 }));
  expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: "image-2", kind: "english", version: 1 }));
});

it("finishes an import when mounted under React strict mode", async () => {
  const api = service([]);
  render(<StrictMode><PhotoArchivePage service={api} /></StrictMode>);
  const file = new File(["image"], "strict.png", { type: "image/png", lastModified: 1 });
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer) });
  fireEvent.change(screen.getByLabelText("从设备选择照片"), { target: { files: [file] } });

  await userEvent.setup().click(screen.getByRole("button", { name: "保存到照片资料库" }));

  expect(await screen.findByText(/已保存 1 张照片/)).toBeInTheDocument();
});

it("previews AI suggestions for only the opened photo and applies title and kind through the existing update", async () => {
  const api = service();
  const ai = aiService();
  const user = userEvent.setup();
  render(<PhotoArchivePage service={api} aiService={ai} />);
  await user.click(await screen.findByRole("button", { name: "查看旧单词纸原图" }));
  await user.click(screen.getByRole("button", { name: "AI 整理" }));

  expect(ai.organizePhotoMaterial).toHaveBeenCalledWith({ attachmentId: "image-1" });
  expect(screen.getByLabelText("照片标题")).toHaveValue("旧单词纸");
  expect(screen.getByLabelText("资料类型")).toHaveValue("english");
  expect(screen.getByDisplayValue("这是一张作文草稿，包含开头和两个论点。")).toHaveAttribute("readonly");
  expect(api.update).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "应用所选建议" }));
  await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
    attachmentId: "image-1", version: 1, studyDate: "2026-09-27", memorized: false,
    title: "整理后的作文照片", kind: "essay",
  })));
  expect(api.update).toHaveBeenCalledTimes(1);
});

it("keeps the photo unchanged and links to settings when photo AI is not configured", async () => {
  const api = service();
  const ai = aiService({ organizePhotoMaterial: vi.fn().mockRejectedValue(new AiServiceError("AI_NOT_CONFIGURED", "请先完整填写 AI 设置并保存密钥。")) });
  const user = userEvent.setup();
  render(<PhotoArchivePage service={api} aiService={ai} />);
  await user.click(await screen.findByRole("button", { name: "查看旧单词纸原图" }));
  await user.click(screen.getByRole("button", { name: "AI 整理" }));
  expect(await screen.findByRole("link", { name: "前往 AI 设置" })).toHaveAttribute("href", "/settings#ai-assistant");
  expect(api.update).not.toHaveBeenCalled();
});
