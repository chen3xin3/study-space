import type { FocusSound } from "../settings/settings.types";

type PlayableFocusSound = Exclude<FocusSound, "off">;

export interface AmbientSoundEngine {
  isSupported(): boolean;
  play(kind: PlayableFocusSound, volume: number): Promise<void>;
  setVolume(volume: number): void;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

type ContextFactory = (() => AudioContext) | null;

function defaultContextFactory(): ContextFactory {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextClass ? () => new AudioContextClass() : null;
}

export class WebAudioAmbientSoundEngine implements AmbientSoundEngine {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;

  constructor(private readonly contextFactory: ContextFactory = defaultContextFactory()) {}

  isSupported(): boolean { return this.contextFactory !== null; }

  async play(kind: PlayableFocusSound, volume: number): Promise<void> {
    if (!this.contextFactory) throw new Error("当前设备不支持专注声音");
    await this.stop();
    this.context ??= this.contextFactory();
    if (this.context.state === "suspended") await this.context.resume();
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    fillNoise(buffer.getChannelData(0), kind);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer; source.loop = true; gain.gain.value = clampVolume(volume);
    source.connect(gain); gain.connect(this.context.destination); source.start();
    this.source = source; this.gain = gain;
  }

  setVolume(volume: number): void { if (this.gain) this.gain.gain.value = clampVolume(volume); }

  async stop(): Promise<void> {
    if (this.source) { try { this.source.stop(); } catch { /* already stopped */ } this.source.disconnect(); }
    this.gain?.disconnect(); this.source = null; this.gain = null;
  }

  async dispose(): Promise<void> {
    await this.stop();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
  }
}

function clampVolume(value: number): number { return Math.min(1, Math.max(0, value)); }

function fillNoise(data: Float32Array, kind: PlayableFocusSound): void {
  let brown = 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    if (kind === "white") data[index] = white;
    else if (kind === "brown") { brown = (brown + 0.02 * white) / 1.02; data[index] = brown * 3.5; }
    else {
      b0 = .99886 * b0 + white * .0555179; b1 = .99332 * b1 + white * .0750759;
      b2 = .969 * b2 + white * .153852; b3 = .8665 * b3 + white * .3104856;
      b4 = .55 * b4 + white * .5329522; b5 = -.7616 * b5 - white * .016898;
      data[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11; b6 = white * .115926;
    }
  }
}
