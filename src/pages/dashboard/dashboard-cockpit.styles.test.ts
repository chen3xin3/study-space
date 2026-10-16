import styles from "./dashboard-cockpit.css?raw";

it("keeps the final dashboard grid free of decorative English labels", () => {
  expect(styles).toContain(".dashboard-main-grid");
  expect(styles).toContain(".dashboard-trend-grid");
  expect(styles).not.toContain("RHYTHM / 07 DAYS");
  expect(styles).not.toContain("MONTHLY SIGNAL");
  expect(styles).not.toContain("TODAY / EXECUTION LOG");
  expect(styles).not.toContain(".dashboard-quick-start");
});

it("uses the shared touch target for dashboard review actions", () => {
  expect(styles).toMatch(/\.today-review-card__actions\s*>\s*a[^}]*min-height:\s*var\(--touch-target\)/s);
});

it("uses the shared type system without tilted dashboard cards", () => {
  expect(styles).not.toContain("Georgia");
  expect(styles).not.toMatch(/\.dashboard-instrument--tasks\s*\{[^}]*transform:\s*rotate/s);
});
