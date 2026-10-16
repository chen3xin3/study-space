import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App route loading", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows an accessible fallback while a secondary route is loaded", async () => {
    render(<MemoryRouter initialEntries={["/settings"]}><App /></MemoryRouter>);

    expect(screen.getByRole("status", { name: "正在打开页面" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "让空间更适合你" })).toBeInTheDocument();
  });
});

