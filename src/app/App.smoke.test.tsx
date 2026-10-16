import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";

it("renders the study space brand", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText("学习空间")).toBeInTheDocument();
  expect(screen.queryByText("我的考研空间")).not.toBeInTheDocument();
});
