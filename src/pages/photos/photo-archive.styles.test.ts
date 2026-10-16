import appStyles from "../../app/app.css?raw";
import settingsStyles from "../settings/settings.css?raw";
import photoPageSource from "./PhotoArchivePage.tsx?raw";

it("loads photo-owned styles with the lazy photo route and keeps shared errors global", () => {
  expect(photoPageSource).toContain('import "./photo-archive.css";');
  expect(appStyles).not.toContain(".photo-archive {");
  expect(appStyles).not.toContain(".photo-import-tray {");
  expect(appStyles).toContain(".data-error {");
  expect(settingsStyles).not.toContain(".data-error {");
});
