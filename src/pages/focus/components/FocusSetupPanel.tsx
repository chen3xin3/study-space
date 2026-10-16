import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Play, SlidersHorizontal } from "lucide-react";
import type { CreateFocusPresetInput, FocusMode, FocusPreset, FocusSubject, StartFocusInput } from "../../../services/focus/focus.types";

const subjects: Array<{ value: FocusSubject; label: string }> = [
  { value: "english", label: "英语" }, { value: "math", label: "数学" },
  { value: "specialty", label: "专业课" }, { value: "politics", label: "政治" },
  { value: "other", label: "其他" },
];

export interface FocusSetupPanelProps {
  presets: FocusPreset[];
  initialSubject: FocusSubject;
  initialGoal: string;
  planId: string | null;
  learningItemId?: string | null;
  disabled?: boolean;
  onStart(input: StartFocusInput): void | Promise<void>;
  onSavePreset(input: CreateFocusPresetInput): void | Promise<void>;
}

export function FocusSetupPanel({ presets, initialSubject, initialGoal, planId, learningItemId = null, disabled = false, onStart, onSavePreset }: FocusSetupPanelProps) {
  const initial = presets[0];
  const [mode, setMode] = useState<FocusMode>("pomodoro");
  const [subject, setSubject] = useState(initialSubject);
  const [goal, setGoal] = useState(initialGoal);
  const [workMinutes, setWorkMinutes] = useState(initial?.workSeconds / 60 || 25);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(initial?.shortBreakSeconds / 60 || 5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(initial?.longBreakSeconds / 60 || 15);
  const [cycles, setCycles] = useState(initial?.cyclesPerSet || 4);
  const [longAfter, setLongAfter] = useState(initial?.longBreakAfterCycles || 4);
  const [autoBreak, setAutoBreak] = useState(initial?.autoStartBreak || false);
  const [autoWork, setAutoWork] = useState(initial?.autoStartWork || false);
  const [presetId, setPresetId] = useState<string | null>(initial?.id ?? null);
  const [presetName, setPresetName] = useState("");
  const hydratedPresets = useRef(Boolean(initial));
  useEffect(() => { setSubject(initialSubject); setGoal(initialGoal); }, [initialGoal, initialSubject, planId]);
  useEffect(() => {
    if (!hydratedPresets.current && presets[0]) {
      hydratedPresets.current = true;
      applyPreset(presets[0]);
    }
  }, [presets]);

  const validation = useMemo(() => {
    if (workMinutes < 1 || workMinutes > 240) return "专注时长需为 1–240 分钟";
    if (mode === "pomodoro" && (shortBreakMinutes < 0 || shortBreakMinutes > 60)) return "短休息需为 0–60 分钟";
    if (mode === "pomodoro" && (longBreakMinutes < 0 || longBreakMinutes > 120)) return "长休息需为 0–120 分钟";
    if (cycles < 1 || cycles > 12) return "每组轮数需为 1–12";
    if (longAfter < 1 || longAfter > cycles) return "长休息轮次不能超过每组轮数";
    if (goal.length > 120) return "本次目标不能超过 120 字";
    return "";
  }, [autoBreak, autoWork, cycles, goal, longAfter, longBreakMinutes, mode, shortBreakMinutes, workMinutes]);

  function applyPreset(preset: FocusPreset) {
    setMode(preset.mode); setWorkMinutes(preset.workSeconds / 60); setShortBreakMinutes(preset.shortBreakSeconds / 60);
    setLongBreakMinutes(preset.longBreakSeconds / 60); setCycles(preset.cyclesPerSet); setLongAfter(preset.longBreakAfterCycles);
    setAutoBreak(preset.autoStartBreak); setAutoWork(preset.autoStartWork); setPresetId(preset.id);
  }
  const toStartInput = (): StartFocusInput => ({
    mode, subject, goal: goal.trim(), workSeconds: workMinutes * 60,
    breakSeconds: mode === "open" ? 0 : shortBreakMinutes * 60,
    longBreakSeconds: mode === "open" ? 0 : longBreakMinutes * 60,
    cyclesPerSet: mode === "open" ? 1 : cycles,
    longBreakAfterCycles: mode === "open" ? 1 : longAfter,
    autoStartBreak: mode === "pomodoro" && autoBreak,
    autoStartWork: mode === "pomodoro" && autoWork,
    planId, presetId: mode === "open" ? null : presetId,
    ...(learningItemId ? { learningItemId } : {}),
  });
  const toPresetInput = (): CreateFocusPresetInput => ({
    name: presetName.trim(), mode, workSeconds: workMinutes * 60,
    shortBreakSeconds: mode === "open" ? 0 : shortBreakMinutes * 60,
    longBreakSeconds: mode === "open" ? 0 : longBreakMinutes * 60,
    cyclesPerSet: mode === "open" ? 1 : cycles,
    longBreakAfterCycles: mode === "open" ? 1 : longAfter,
    autoStartBreak: mode === "pomodoro" && autoBreak,
    autoStartWork: mode === "pomodoro" && autoWork,
  });

  return <section className="focus-setup-panel" aria-label="专注方案控制台">
    <header><span><SlidersHorizontal size={16} /> CONTROL DESK</span><h2>搭好这一轮的节奏</h2><p>所有数值都能改，预设只是起点。</p></header>
    <div className="focus-mode"><button className={mode === "pomodoro" ? "is-active" : ""} disabled={disabled} onClick={() => { setMode("pomodoro"); setPresetId(null); }}>倒计时</button><button className={mode === "open" ? "is-active" : ""} disabled={disabled} onClick={() => { setMode("open"); setPresetId(null); }}>正向计时</button></div>
    {mode === "pomodoro" && <div className="focus-preset-chips">{presets.map((preset) => <button key={preset.id} className={presetId === preset.id ? "is-active" : ""} disabled={disabled} aria-label={`${preset.name} ${preset.workSeconds / 60}/${preset.shortBreakSeconds / 60}`} onClick={() => applyPreset(preset)}><strong>{preset.name}</strong><small>{preset.workSeconds / 60}/{preset.shortBreakSeconds / 60}</small></button>)}</div>}
    <div className="focus-setup-fields">
      <label>学习科目<select value={subject} disabled={disabled} onChange={(event) => setSubject(event.target.value as FocusSubject)}>{subjects.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="is-wide">本次目标<input value={goal} disabled={disabled} maxLength={120} onChange={(event) => setGoal(event.target.value)} /></label>
      <label>专注分钟<input type="number" min={1} max={240} value={workMinutes} disabled={disabled} onChange={(event) => setWorkMinutes(Number(event.target.value))} /></label>
      {mode === "pomodoro" && <><label>短休息分钟<input type="number" min={0} max={60} value={shortBreakMinutes} disabled={disabled} onChange={(event) => setShortBreakMinutes(Number(event.target.value))} /></label><label>长休息分钟<input type="number" min={0} max={120} value={longBreakMinutes} disabled={disabled} onChange={(event) => setLongBreakMinutes(Number(event.target.value))} /></label><label>每组轮数<input type="number" min={1} max={12} value={cycles} disabled={disabled} onChange={(event) => setCycles(Number(event.target.value))} /></label><label>长休息轮次<input type="number" min={1} max={12} value={longAfter} disabled={disabled} onChange={(event) => setLongAfter(Number(event.target.value))} /></label></>}
    </div>
    {mode === "pomodoro" && <div className="focus-auto-options"><label><input type="checkbox" checked={autoBreak} disabled={disabled} onChange={(event) => setAutoBreak(event.target.checked)} />自动开始休息</label><label><input type="checkbox" checked={autoWork} disabled={disabled} onChange={(event) => setAutoWork(event.target.checked)} />自动开始下一轮</label></div>}
    {validation && <p className="focus-setup-validation" role="alert">{validation}</p>}
    <div className="focus-setup-actions"><button className="primary-button" disabled={disabled || !!validation} onClick={() => void onStart(toStartInput())}><Play size={17} />开始专注</button><label>方案名称<input value={presetName} disabled={disabled} placeholder="例如：晨间冲刺" maxLength={40} onChange={(event) => setPresetName(event.target.value)} /></label><button className="secondary-button" disabled={disabled || !!validation || !presetName.trim()} onClick={() => void onSavePreset(toPresetInput())}><BookmarkPlus size={16} />保存为我的方案</button></div>
  </section>;
}
