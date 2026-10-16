import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../../../services/learning-items/learning-item.types";
import type { PhotoRecord } from "../../../services/photo-archive/photo-archive.types";
import { OrganizationCandidateList } from "./OrganizationCandidateList";
import type { OrganizationCandidate } from "./organization-queue";

const learningRecord: LearningItem = {
  id: "item-1", subject: "math", collection: "math-wrong", kind: "question",
  title: "极限错题", content: "题目", answer: "答案", tags: [], mastery: "learning",
  source: "试卷", score: null, maxScore: null, reviewAt: null, favorite: false,
  lastOpenedAt: "2026-10-10", createdAt: "2026-10-09", updatedAt: "2026-10-10",
  deletedAt: null, version: 1,
};

const photoRecord: PhotoRecord = {
  attachmentId: "photo-1", studyDate: "2026-10-10", studyDateConfirmed: true,
  title: "英语试卷", kind: "english", memorized: false, originalName: "paper.jpg",
  mediaType: "image/jpeg", createdAt: "2026-10-09", updatedAt: "2026-10-10",
  version: 1, deletedAt: null,
};

const candidates: OrganizationCandidate[] = [
  { id: "learning:item-1", source: "learning", title: "极限错题", subject: "math", updatedAt: "2026-10-10", record: learningRecord },
  { id: "photo:photo-1", source: "photo", title: "英语试卷", subject: "english", updatedAt: "2026-10-10", record: photoRecord },
];

function Harness({ items = candidates, onChange = vi.fn() }: { items?: OrganizationCandidate[]; onChange?: (value: OrganizationCandidate[]) => void }) {
  const [selected, setSelected] = useState<OrganizationCandidate[]>([]);
  return <OrganizationCandidateList candidates={items} selected={selected} onSelectionChange={(next) => { setSelected(next); onChange(next); }} />;
}

describe("OrganizationCandidateList", () => {
  it("selects records across the learning and photo sources", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole("tab", { name: "学习资料" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 极限错题" }));
    fireEvent.click(screen.getByRole("tab", { name: "学习照片" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 英语试卷" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "learning:item-1" }),
      expect.objectContaining({ id: "photo:photo-1" }),
    ]));
    expect(screen.getByText("已选择 2/10")).toBeInTheDocument();
  });

  it("filters by search and learning subject and excludes deleted records", () => {
    const deleted = { ...candidates[0], id: "learning:deleted", title: "已删除资料", record: { ...learningRecord, id: "deleted", deletedAt: "2026-10-11" } };
    render(<Harness items={[...candidates, deleted]} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索待整理资料" }), { target: { value: "极限" } });
    expect(screen.getByText("极限错题")).toBeInTheDocument();
    expect(screen.queryByText("已删除资料")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("筛选科目"), { target: { value: "english" } });
    expect(screen.queryByText("极限错题")).not.toBeInTheDocument();
  });

  it("disables new selections at ten but keeps selected records removable", () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      ...candidates[0], id: `learning:item-${index}`, title: `资料 ${index}`,
      record: { ...learningRecord, id: `item-${index}`, title: `资料 ${index}` },
    }));
    const selected = many.slice(0, 10);
    const onSelectionChange = vi.fn();
    render(<OrganizationCandidateList candidates={many} selected={selected} onSelectionChange={onSelectionChange} />);
    expect(screen.getByRole("checkbox", { name: "选择 资料 10" })).toBeDisabled();
    const selectedBox = screen.getByRole("checkbox", { name: "选择 资料 0" });
    expect(selectedBox).not.toBeDisabled();
    fireEvent.click(selectedBox);
    expect(onSelectionChange).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ id: "learning:item-0" })]));
  });
});
