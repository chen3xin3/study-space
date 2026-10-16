import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { SettingsProvider } from "../../services/settings/SettingsProvider";
import { DashboardCockpit } from "./DashboardCockpit";

function renderCockpit(props: Partial<ComponentProps<typeof DashboardCockpit>> = {}) {
  render(
    <MemoryRouter>
      <SettingsProvider>
        <DashboardCockpit completedTasks={3} totalTasks={5} todaySeconds={8280} streakDays={12} {...props} />
      </SettingsProvider>
    </MemoryRouter>,
  );
}

it("presents real dashboard values as cockpit instruments", () => {
  renderCockpit();
  expect(screen.getByRole("region", { name: "备考全局概览" })).toHaveAttribute("data-art-direction", "fresh-cockpit");
  expect(screen.getByRole("progressbar", { name: "今日任务完成进度" })).toHaveAttribute("aria-valuenow", "60");
  expect(screen.getByText("2小时18分钟")).toBeInTheDocument();
  expect(screen.getByText("连续 12 天")).toBeInTheDocument();
  expect(screen.getByLabelText("当前时间与考研倒计时")).toBeInTheDocument();
});

it("shows pending instruments without inventing totals", () => {
  renderCockpit({ completedTasks: undefined, totalTasks: undefined, todaySeconds: undefined, streakDays: undefined });
  expect(screen.getAllByText("—")).toHaveLength(3);
  expect(screen.queryByText(/60%|2小时18分钟|连续 12 天/)).not.toBeInTheDocument();
});
