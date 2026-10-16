import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { PhotoImportQueueItem } from "./photo-import-queue";
import { PhotoImportTray } from "./PhotoImportTray";

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

it("shows progress and allows stopping future imports", async () => {
  const stop = vi.fn();
  const retry = vi.fn();
  const file = new File(["image"], "notes.png", { type: "image/png", lastModified: 1 });
  const items: PhotoImportQueueItem[] = [{ id: "notes", file, status: "importing", error: "" }];

  render(<PhotoImportTray items={items} studyDate="2026-10-05" kind="other" today="2026-10-05"
    busy progress={{ completed: 0, total: 1, succeeded: 0, failed: 0 }}
    onStudyDateChange={vi.fn()} onKindChange={vi.fn()} onRemove={vi.fn()}
    onCancel={vi.fn()} onStop={stop} onRetry={retry} onSave={vi.fn()} />);

  expect(screen.getByText("正在处理 0 / 1")).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "停止后续导入" }));
  expect(stop).toHaveBeenCalledOnce();
});

it("keeps failed items visible and offers a retry", async () => {
  const retry = vi.fn();
  const file = new File(["image"], "notes.png", { type: "image/png", lastModified: 1 });
  const items: PhotoImportQueueItem[] = [{ id: "notes", file, status: "failed", error: "磁盘暂时不可用" }];

  render(<PhotoImportTray items={items} studyDate="2026-10-05" kind="other" today="2026-10-05"
    busy={false} progress={{ completed: 1, total: 1, succeeded: 0, failed: 1 }}
    onStudyDateChange={vi.fn()} onKindChange={vi.fn()} onRemove={vi.fn()}
    onCancel={vi.fn()} onStop={vi.fn()} onRetry={retry} onSave={vi.fn()} />);

  expect(screen.getByText("磁盘暂时不可用")).toBeInTheDocument();
  expect(screen.getByText("notes.png").parentElement).toHaveClass("photo-import-tray__file-info");
  await userEvent.setup().click(screen.getByRole("button", { name: "重试失败项" }));
  expect(retry).toHaveBeenCalledOnce();
});
