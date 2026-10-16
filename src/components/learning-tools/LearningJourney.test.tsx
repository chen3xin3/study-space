import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LearningJourney } from "./LearningJourney";

it("marks the current learning stage and links the complete journey", () => {
  render(<MemoryRouter initialEntries={["/statistics"]}><LearningJourney current="statistics" /></MemoryRouter>);
  const nav = screen.getByRole("navigation", { name: "学习轨迹" });
  expect(within(nav).getByRole("link", { name: /专注/ })).toHaveAttribute("href", "/focus");
  expect(within(nav).getByRole("link", { name: /复盘/ })).toHaveAttribute("aria-current", "step");
  expect(within(nav).getByRole("link", { name: /资料/ })).toHaveAttribute("href", "/library");
});
