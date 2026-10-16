import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { FocusQuickTools } from "./FocusQuickTools";

it("opens focus tools and links to statistics", async () => {
  const user = userEvent.setup(); const onOpenSettings = vi.fn(); const onOpenEnvironment = vi.fn(); const onImmersive = vi.fn();
  render(<MemoryRouter><FocusQuickTools settingsDisabled={false} onOpenSettings={onOpenSettings} onOpenEnvironment={onOpenEnvironment} onImmersive={onImmersive} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "专注设置" }));
  await user.click(screen.getByRole("button", { name: "专注环境" }));
  await user.click(screen.getByRole("button", { name: "沉浸模式" }));
  expect(onOpenSettings).toHaveBeenCalled(); expect(onOpenEnvironment).toHaveBeenCalled(); expect(onImmersive).toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "查看统计" })).toHaveAttribute("href", "/statistics");
});

it("locks settings without locking environment controls", () => {
  render(<MemoryRouter><FocusQuickTools settingsDisabled onOpenSettings={vi.fn()} onOpenEnvironment={vi.fn()} onImmersive={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "专注设置" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "专注环境" })).toBeEnabled();
});
