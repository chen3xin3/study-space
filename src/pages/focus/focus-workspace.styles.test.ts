import styles from "./focus-workspace.css?raw";

it("uses the approved spectrum console at tablet width", () => {
  expect(styles).toMatch(/\.focus-workspace-page\s*\{[^}]*align-content:\s*start/s);
  expect(styles).toContain("--focus-spectrum-violet: #7567df");
  expect(styles).toMatch(/\.focus-spectrum-wave\s*\{/);
  expect(styles).toMatch(/\.focus-task-rail\s*\{[^}]*background:\s*#292640/s);
  expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.focus-workspace\s*\{[^}]*flex-direction:\s*column/s);
  expect(styles).not.toContain("text-shadow:");
});

it("uses the shared touch target for timer, task, and quick-tool controls", () => {
  expect(styles).toMatch(/\.focus-task-card__actions button[\s\S]*\.focus-ready-start[\s\S]*\.focus-workspace-page \.focus-actions button[\s\S]*\.focus-quick-tools button[\s\S]*min-block-size:\s*var\(--touch-target\)/);
});

it("reserves special typography for the timer instead of ordinary headings", () => {
  expect(styles).toMatch(/\.focus-ready-clock,\.focus-workspace-page \.focus-clock\s*\{[^}]*font-family:\s*Georgia/s);
  expect(styles).not.toMatch(/\.focus-workspace-header h1\s*\{[^}]*Georgia/s);
});
