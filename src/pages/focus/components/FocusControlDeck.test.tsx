import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FocusControlDeck } from "./FocusControlDeck";

const panels = { setup: <div>方案内容</div>, environment: <div>环境内容</div>, history: <div>记录内容</div> };

it("starts on setup and exposes accessible tabs", async () => {
  const user = userEvent.setup();
  render(<FocusControlDeck activeSession={false} {...panels} />);
  expect(screen.getByRole("tab", { name: "方案" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("方案内容");
  await user.click(screen.getByRole("tab", { name: "环境" }));
  expect(screen.getByRole("tab", { name: "环境" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("环境内容");
});

it("moves to environment once when a session starts but preserves later manual choices", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<FocusControlDeck activeSession={false} {...panels} />);
  rerender(<FocusControlDeck activeSession {...panels} />);
  expect(screen.getByRole("tabpanel")).toHaveTextContent("环境内容");
  await user.click(screen.getByRole("tab", { name: "记录" }));
  rerender(<FocusControlDeck activeSession {...panels} />);
  expect(screen.getByRole("tabpanel")).toHaveTextContent("记录内容");
});
