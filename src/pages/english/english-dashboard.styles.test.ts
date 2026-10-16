import appStyles from "../../app/app.css?raw";
import dashboardSource from "./EnglishDashboard.tsx?raw";
import resourceStyles from "./english-color-archive.css?raw";

it("uses a colorful English archive without restoring the scrapbook treatment", () => {
  expect(dashboardSource).toContain('import "./english-color-archive.css";');
  expect(resourceStyles).toContain(".english-resource-space");
  expect(dashboardSource).toContain("english-resource-imports");
  expect(dashboardSource).toContain("english-resource-shelf");
  expect(resourceStyles).toContain("#f39a84");
  expect(resourceStyles).toContain("#c8b5e9");
  expect(resourceStyles).toContain("#24483e");
  expect(resourceStyles).toContain(".english-intake-card--essay");
  expect(resourceStyles).not.toContain("transform:rotate");
  expect(resourceStyles).not.toContain("english-paper-tape");
  expect(resourceStyles).not.toContain("Georgia");
  expect(appStyles).not.toContain(".english-dashboard");
  expect(appStyles).not.toContain(".english-hero");
  expect(appStyles).not.toContain(".english-space-");
  expect(appStyles).not.toContain(".english-workspace");
  expect(appStyles).not.toContain(".english-editorial");
  expect(appStyles).not.toContain(".english-capture");
  expect(appStyles).not.toContain(".english-library");
});

it("uses shared touch targets and stacks the archive before the drawer on portrait tablets", () => {
  expect(resourceStyles).toMatch(/\.english-photo-link,\.english-library-link,\.english-photo-card,\.english-intake-card\s*\{[^}]*min-block-size:\s*var\(--touch-target\)/);
  expect(resourceStyles).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*\.english-resource-imports\s*\{[^}]*grid-template-columns:\s*1fr/);
  expect(resourceStyles).not.toMatch(/transform:\s*rotate/);
});
