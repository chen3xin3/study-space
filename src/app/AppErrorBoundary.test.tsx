import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenPage(): never {
  throw new Error("render failed");
}

it("returns to a working home page after a render failure", async () => {
  const user = userEvent.setup();
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  render(
    <MemoryRouter initialEntries={["/broken"]}>
      <AppErrorBoundary>
        <Routes>
          <Route path="/" element={<h1>学习首页</h1>} />
          <Route path="/broken" element={<BrokenPage />} />
        </Routes>
      </AppErrorBoundary>
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "页面暂时无法显示" })).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "返回首页" }));
  expect(screen.getByRole("heading", { name: "学习首页" })).toBeInTheDocument();
  consoleSpy.mockRestore();
});
