import { vi } from "vitest";
import { WebAudioAmbientSoundEngine } from "./ambient-sound.engine";

function audioHarness() {
  const data = new Float32Array(16);
  const source = { buffer: null, loop: false, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    sampleRate: 8, destination: {}, state: "running",
    createBuffer: vi.fn(() => ({ getChannelData: () => data })),
    createBufferSource: vi.fn(() => source), createGain: vi.fn(() => gain),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  return { context, source, gain, data };
}

it("plays one generated looping noise graph at a time", async () => {
  const harness = audioHarness();
  const engine = new WebAudioAmbientSoundEngine(() => harness.context as never);
  await engine.play("white", 0.35);
  expect(harness.context.createBuffer).toHaveBeenCalledWith(1, 16, 8);
  expect(harness.source.loop).toBe(true);
  expect(harness.gain.gain.value).toBe(0.35);
  expect(harness.source.start).toHaveBeenCalled();
  await engine.play("brown", 0.6);
  expect(harness.source.stop).toHaveBeenCalled();
  expect(harness.context.createBufferSource).toHaveBeenCalledTimes(2);
});

it("changes volume, stops, and closes cleanly", async () => {
  const harness = audioHarness();
  const engine = new WebAudioAmbientSoundEngine(() => harness.context as never);
  await engine.play("pink", 0.2);
  engine.setVolume(2);
  expect(harness.gain.gain.value).toBe(1);
  await engine.stop();
  expect(harness.source.disconnect).toHaveBeenCalled();
  await engine.dispose();
  expect(harness.context.close).toHaveBeenCalled();
});

it("reports unsupported browsers without throwing during detection", () => {
  const engine = new WebAudioAmbientSoundEngine(null);
  expect(engine.isSupported()).toBe(false);
});
