import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FocusEnvironmentPanel } from "./FocusEnvironmentPanel";

function engine() {
  return { isSupported: vi.fn(() => true), play: vi.fn().mockResolvedValue(undefined), setVolume: vi.fn(), stop: vi.fn().mockResolvedValue(undefined), dispose: vi.fn().mockResolvedValue(undefined) };
}
function windowAdapter(supported = true) {
  return { supportsAlwaysOnTop: vi.fn().mockResolvedValue(supported), setAlwaysOnTop: vi.fn().mockResolvedValue(undefined) };
}

it("selects generated sounds and saves volume preferences", async () => {
  const sound = engine(); const onChange = vi.fn(); const user = userEvent.setup();
  render(<FocusEnvironmentPanel engine={sound} sound="off" volume={0.35} duringBreak={false} phase="work" onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "棕噪音" }));
  expect(sound.play).toHaveBeenCalledWith("brown", 0.35);
  expect(onChange).toHaveBeenCalledWith({ focusSound: "brown" });
  await user.click(screen.getByLabelText("休息时继续播放"));
  expect(onChange).toHaveBeenCalledWith({ focusSoundDuringBreak: true });
});

it("shows a silent fallback when audio playback is unavailable", async () => {
  const sound = engine(); sound.play.mockRejectedValueOnce(new Error("autoplay blocked"));
  const user = userEvent.setup();
  render(<FocusEnvironmentPanel engine={sound} sound="off" volume={0.35} duringBreak={false} phase="work" onChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "白噪音" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("声音暂时无法播放");
});

it("stays usable when Web Audio is unsupported", () => {
  const sound = engine(); sound.isSupported.mockReturnValue(false);
  render(<FocusEnvironmentPanel engine={sound} sound="off" volume={0.35} duringBreak={false} phase="work" onChange={vi.fn()} />);
  expect(screen.getByText("当前设备暂不支持环境音")).toBeInTheDocument();
});

it("enters immersion and rolls pinning back after a desktop failure", async () => {
  const sound = engine(); const windowing = windowAdapter(); const onImmersiveChange = vi.fn(); const user = userEvent.setup();
  windowing.setAlwaysOnTop.mockRejectedValueOnce(new Error("denied"));
  render(<FocusEnvironmentPanel engine={sound} windowAdapter={windowing} sound="off" volume={0.35} duringBreak={false} phase="work" immersive={false} onImmersiveChange={onImmersiveChange} onChange={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "窗口置顶" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "沉浸模式" }));
  expect(onImmersiveChange).toHaveBeenCalledWith(true);
  await user.click(screen.getByRole("button", { name: "窗口置顶" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("窗口置顶失败");
  expect(screen.getByRole("button", { name: "窗口置顶" })).toHaveAttribute("aria-pressed", "false");
});
