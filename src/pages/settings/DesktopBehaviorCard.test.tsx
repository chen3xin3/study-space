import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { DesktopService } from "../../services/desktop/desktop.types";
import { DesktopBehaviorCard } from "./DesktopBehaviorCard";

it("loads and updates optional desktop behavior", async () => {
  const service: DesktopService = {
    getPreferences: vi.fn().mockResolvedValue({ closeToTray: false, launchAtStartup: false }),
    updatePreferences: vi.fn().mockResolvedValue({ closeToTray: true, launchAtStartup: false }),
  };
  const user = userEvent.setup();
  render(<DesktopBehaviorCard service={service} />);

  const closeToTray = await screen.findByRole("switch", { name: "关闭窗口时最小化到托盘" });
  expect(closeToTray).toHaveAttribute("aria-checked", "false");
  await user.click(closeToTray);
  expect(service.updatePreferences).toHaveBeenCalledWith({ closeToTray: true, launchAtStartup: false });
  expect(await screen.findByText("已启用关闭到托盘。关闭窗口后，软件会留在右下角托盘；需要完全退出时，请右键托盘图标选择“退出”。")).toBeInTheDocument();
});
