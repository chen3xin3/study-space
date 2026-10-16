import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultSettings } from "./settings.defaults";
import { SETTINGS_STORAGE_KEY } from "./settings.repository";
import { SettingsProvider, useSettings } from "./SettingsProvider";

function Probe() {
  const { settings, updateSettings } = useSettings();
  return (
    <button type="button" onClick={() => updateSettings({ aiEnabled: true })}>
      {settings.aiEnabled ? "AI 已开启" : "AI 已关闭"}
    </button>
  );
}

it("updates state and persists changed settings", async () => {
  const user = userEvent.setup();
  render(
    <SettingsProvider>
      <Probe />
    </SettingsProvider>,
  );

  await user.click(screen.getByRole("button", { name: "AI 已关闭" }));

  expect(screen.getByRole("button", { name: "AI 已开启" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual({
    ...defaultSettings,
    aiEnabled: true,
  });
});
