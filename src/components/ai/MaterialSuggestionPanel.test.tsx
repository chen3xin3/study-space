import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MaterialSuggestionPanel } from "./MaterialSuggestionPanel";

const rows = [
  { id: "title", label: "标题", currentValue: "旧标题", suggestedValue: "新标题" },
  { id: "tags", label: "标签", currentValue: "高数", suggestedValue: "高数，极限" },
  { id: "same", label: "来源", currentValue: "教材", suggestedValue: "教材" },
  { id: "summary", label: "资料摘要", currentValue: "", suggestedValue: "一段摘要", multiline: true, selectedByDefault: false },
];

describe("MaterialSuggestionPanel", () => {
  it("shows changed values and applies only selected edited suggestions", async () => {
    const onApply = vi.fn();
    render(<MaterialSuggestionPanel rows={rows} onApply={onApply} onCancel={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "AI 整理建议" })).toBeInTheDocument();
    expect(screen.queryByText("来源")).not.toBeInTheDocument();
    expect(screen.getByText("旧标题")).toBeInTheDocument();
    expect(screen.getByDisplayValue("新标题")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 整理建议" })).toHaveFocus();

    fireEvent.change(screen.getByLabelText("标题建议"), { target: { value: "整理后的标题" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "应用标签" }));
    fireEvent.click(screen.getByRole("button", { name: "应用所选建议" }));

    expect(onApply).toHaveBeenCalledWith({ title: "整理后的标题" });
  });

  it("keeps optional summary unselected until the user chooses it", () => {
    const onApply = vi.fn();
    render(<MaterialSuggestionPanel rows={rows} onApply={onApply} onCancel={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "应用资料摘要" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "应用资料摘要" }));
    fireEvent.click(screen.getByRole("button", { name: "应用所选建议" }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ summary: "一段摘要" }));
  });

  it("cancels with the button or Escape without applying", () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const view = render(<MaterialSuggestionPanel rows={rows} onApply={onApply} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();

    view.rerender(<MaterialSuggestionPanel rows={rows} onApply={onApply} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("copies a reference-only summary without including it in apply values", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onApply = vi.fn();
    render(<MaterialSuggestionPanel rows={[{
      id: "photoSummary",
      label: "内容摘要",
      currentValue: "",
      suggestedValue: "照片内容摘要",
      multiline: true,
      applyable: false,
    }, ...rows.slice(0, 1)]} onApply={onApply} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "复制内容摘要" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("照片内容摘要"));
    fireEvent.click(screen.getByRole("button", { name: "应用所选建议" }));
    expect(onApply).toHaveBeenCalledWith({ title: "新标题" });
  });

  it("offers an optional queue skip action without changing existing consumers", () => {
    const onSkip = vi.fn();
    const view = render(<MaterialSuggestionPanel rows={rows} onApply={vi.fn()} onCancel={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "跳过这条" }));
    expect(onSkip).toHaveBeenCalledOnce();

    view.rerender(<MaterialSuggestionPanel rows={rows} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "跳过这条" })).not.toBeInTheDocument();
  });
});
