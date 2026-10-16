import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { DiagnosticsService } from "../../services/diagnostics/diagnostics.types";
import { DiagnosticsCard } from "./DiagnosticsCard";

function service(): DiagnosticsService {
  return {
    getStatus: vi.fn().mockResolvedValue({
      healthy: true,
      appVersion: "0.5.3",
      logDirectory: "D:\\logs",
      schemaVersion: 15,
      attachmentCount: 4,
      recentEvents: ["2026-10-05 startup_ready"],
    }),
    openLogFolder: vi.fn().mockResolvedValue(undefined),
    exportReport: vi.fn().mockResolvedValue("D:\\report.txt"),
  };
}

it("shows health and exports a diagnostic report", async () => {
  const diagnostics = service();
  const user = userEvent.setup();
  render(<DiagnosticsCard service={diagnostics} />);

  expect(await screen.findByText("运行正常")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "导出诊断报告" }));
  expect(await screen.findByText(/report\.txt/)).toBeInTheDocument();
  expect(diagnostics.exportReport).toHaveBeenCalled();
});
