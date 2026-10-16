import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { themes } from "../../themes/themes";
import { EmptyState } from "./EmptyState";
import { Switch } from "./Switch";

it("provides all six visual themes in a stable order", () => {
  expect(themes.map((theme) => theme.id)).toEqual([
    "eye-care",
    "macaron",
    "classic-green",
    "minimal-white",
    "night",
    "soft-gradient",
  ]);
});

it("exposes switch state and handles user input", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Switch label="启用 AI 学习助手" checked={false} onChange={onChange} />);

  const control = screen.getByRole("switch", { name: "启用 AI 学习助手" });
  expect(control).toHaveAttribute("aria-checked", "false");
  await user.click(control);
  expect(onChange).toHaveBeenCalledWith(true);
});

it("renders an empty state with an optional action", () => {
  render(
    <EmptyState
      title="还没有学习记录"
      description="开始记录后，这里会显示你的学习进展。"
      action={<button type="button">开始记录</button>}
    />,
  );

  expect(screen.getByRole("heading", { name: "还没有学习记录" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "开始记录" })).toBeInTheDocument();
});
