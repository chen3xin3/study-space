import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { learningItem } from "../study-test-helpers";
import { LearningItemCard } from "./LearningItemCard";

function renderCard(item = learningItem()) {
  render(<MemoryRouter><LearningItemCard item={item} trash={false} busy={false} onFavorite={vi.fn()} onDelete={vi.fn()} onRestore={vi.fn()} onDeletePermanently={vi.fn()} onAddTask={vi.fn()} /></MemoryRouter>);
}

describe("LearningItemCard review action", () => {
  it("offers redo only for active math wrong questions", () => {
    renderCard();
    expect(screen.getByRole("link", { name: "重做 极限计算" })).toHaveAttribute("href", "/study/math/wrong-questions/item-1/review");
  });

  it("does not offer redo for generic learning items", () => {
    renderCard(learningItem({ subject: "politics", collection: "wrong-questions", title: "政治错题" }));
    expect(screen.queryByRole("link", { name: /重做/ })).not.toBeInTheDocument();
  });
});
