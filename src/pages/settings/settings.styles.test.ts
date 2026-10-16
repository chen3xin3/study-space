import appStyles from "../../app/app.css?raw";
import settingsPageSource from "./SettingsPage.tsx?raw";
import settingsStyles from "./settings.css?raw";

it("loads settings-owned styles with the lazy settings route", () => {
  expect(settingsPageSource).toContain('import "./settings.css";');
  expect(appStyles).not.toContain(".settings-nav {");
  expect(appStyles).not.toContain(".theme-option {");
  expect(appStyles).not.toContain(".data-management {");
});

it("keeps device sync touch-friendly and single-column on tablets", () => {
  expect(settingsStyles).toContain(".device-sync__choice { min-width: 0; min-height: 96px");
  expect(settingsStyles).toContain(".device-sync__actions button { min-height: 44px;");
  expect(settingsStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.device-sync__choices[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});
