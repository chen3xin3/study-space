import appStyles from "../../app/app.css?raw";
import inboxPageSource from "./InboxWorkspacePage.tsx?raw";

it("loads inbox-owned styles with the lazy inbox route and removes legacy placeholders", () => {
  expect(inboxPageSource).toContain('import "./inbox-workspace.css";');
  expect(appStyles).not.toContain(".inbox-page {");
  expect(appStyles).not.toContain(".inbox-types");
  expect(appStyles).not.toContain(".inbox-empty {");
});
