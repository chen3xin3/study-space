import styles from "./app.css?raw";
import tokens from "../themes/tokens.css?raw";

it("keeps navigation and main content in independent viewport scrollers", () => {
  expect(styles).toMatch(/\.app-window\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s);
  expect(styles).toMatch(/\.app-shell\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  expect(styles).toMatch(/\.sidebar__nav\s*\{[^}]*overflow-y:\s*auto/s);
  expect(styles).toMatch(/\.app-content\s*\{[^}]*overflow-y:\s*auto/s);
  expect(styles).not.toMatch(/\.app-content\s*\{\s*overflow:\s*visible/);
});

it("uses a shared tablet-sized touch target for primary navigation and actions", () => {
  expect(tokens).toMatch(/--touch-target:\s*44px/);
  expect(styles).toMatch(/\.nav-item[\s\S]*\.sidebar__toggle[\s\S]*\.primary-button[\s\S]*\.secondary-button\s*\{[^}]*min-height:\s*var\(--touch-target\)/);
});

it("gives disabled controls a consistent non-interactive state", () => {
  expect(styles).toMatch(/button:disabled[\s\S]*\[aria-disabled="true"\]\s*\{[^}]*cursor:\s*not-allowed[^}]*opacity:\s*\.55/s);
});
