import { useEffect, useMemo, useState } from "react";
import { Headphones, Maximize2, Pin, Volume2, Waves } from "lucide-react";
import { WebAudioAmbientSoundEngine, type AmbientSoundEngine } from "../../../services/focus/ambient-sound.engine";
import { RuntimeFocusWindowAdapter, type FocusWindowAdapter } from "../../../services/focus/focus-window.adapter";
import type { FocusSound } from "../../../services/settings/settings.types";

const sounds: Array<{ value: FocusSound; label: string; code: string }> = [
  { value: "off", label: "关闭", code: "OFF" }, { value: "white", label: "白噪音", code: "WH" },
  { value: "pink", label: "粉噪音", code: "PK" }, { value: "brown", label: "棕噪音", code: "BR" },
];

export interface FocusEnvironmentPanelProps {
  engine?: AmbientSoundEngine;
  windowAdapter?: FocusWindowAdapter;
  sound: FocusSound;
  volume: number;
  duringBreak: boolean;
  phase: "work" | "break" | null;
  immersive?: boolean;
  onImmersiveChange?(enabled: boolean): void;
  onChange(changes: { focusSound?: FocusSound; focusSoundVolume?: number; focusSoundDuringBreak?: boolean }): void;
}

export function FocusEnvironmentPanel({ engine: suppliedEngine, windowAdapter: suppliedWindowAdapter, sound, volume, duringBreak, phase, immersive = false, onImmersiveChange = () => undefined, onChange }: FocusEnvironmentPanelProps) {
  const engine = useMemo(() => suppliedEngine ?? new WebAudioAmbientSoundEngine(), [suppliedEngine]);
  const windowAdapter = useMemo(() => suppliedWindowAdapter ?? new RuntimeFocusWindowAdapter(), [suppliedWindowAdapter]);
  const [selected, setSelected] = useState(sound);
  const [level, setLevel] = useState(volume);
  const [error, setError] = useState("");
  const [pinSupported, setPinSupported] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => { void windowAdapter.supportsAlwaysOnTop().then(setPinSupported).catch(() => setPinSupported(false)); }, [windowAdapter]);
  useEffect(() => setSelected(sound), [sound]);
  useEffect(() => setLevel(volume), [volume]);
  useEffect(() => () => { void engine.dispose(); }, [engine]);
  useEffect(() => {
    if (!phase) return;
    if (selected === "off" || (phase === "break" && !duringBreak)) void engine.stop();
    else void engine.play(selected, level).catch(() => setError("声音暂时无法播放，计时不会受影响。请点击后重试。"));
    // Phase changes are the automatic playback boundary; direct sound/volume changes are handled by their controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duringBreak, engine, phase]);

  async function selectSound(next: FocusSound) {
    setError(""); setSelected(next);
    try {
      if (next === "off") await engine.stop();
      else await engine.play(next, level);
      onChange({ focusSound: next });
    } catch { setError("声音暂时无法播放，计时不会受影响。请点击后重试。"); }
  }
  function changeVolume(next: number) {
    setLevel(next); engine.setVolume(next); onChange({ focusSoundVolume: next });
  }
  async function togglePinned() {
    const next = !pinned; setPinned(next); setError("");
    try { await windowAdapter.setAlwaysOnTop(next); }
    catch { setPinned(false); setError("窗口置顶失败，已自动恢复。计时不会受影响。"); }
  }
  return <section className="focus-environment-panel" aria-label="专注环境">
    <header><span><Headphones size={16} /> SOUND LAB</span><h2>给注意力一层背景</h2><p>声音在本地实时生成，不联网，也不会保存录音。</p></header>
    {!engine.isSupported() ? <p className="focus-sound-unsupported"><Waves size={17} />当前设备暂不支持环境音</p> : <>
      <div className="focus-sound-grid">{sounds.map((item) => <button key={item.value} className={selected === item.value ? "is-active" : ""} aria-label={item.label} onClick={() => void selectSound(item.value)}><span>{item.code}</span><strong>{item.label}</strong></button>)}</div>
      <label className="focus-volume"><span><Volume2 size={16} />音量 <strong>{Math.round(level * 100)}%</strong></span><input aria-label="环境音量" type="range" min={0} max={1} step={0.05} value={level} onChange={(event) => changeVolume(Number(event.target.value))} /></label>
      <label className="focus-sound-break"><input type="checkbox" checked={duringBreak} onChange={(event) => onChange({ focusSoundDuringBreak: event.target.checked })} />休息时继续播放</label>
    </>}
    <div className="focus-environment-actions"><button className={immersive ? "is-active" : ""} aria-pressed={immersive} onClick={() => onImmersiveChange(!immersive)}><Maximize2 size={16} />沉浸模式</button>{pinSupported && <button className={pinned ? "is-active" : ""} aria-label="窗口置顶" aria-pressed={pinned} onClick={() => void togglePinned()}><Pin size={16} />窗口置顶</button>}</div>
    {error && <p className="focus-dialog__error" role="alert">{error}</p>}
  </section>;
}
