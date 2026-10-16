import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Play, Plus, RotateCw, Trash2, X } from "lucide-react";
import type { FocusPlan, FocusPlanService, FocusRepeatRule, FocusSubject } from "../../../services/focus/focus.types";

const subjects: Array<{ value: FocusSubject; label: string }> = [
  { value: "english", label: "英语" }, { value: "math", label: "数学" },
  { value: "specialty", label: "专业课" }, { value: "politics", label: "政治" },
  { value: "other", label: "其他" },
];
const repeats: Array<{ value: FocusRepeatRule; label: string }> = [
  { value: "none", label: "不重复" }, { value: "daily", label: "每天" },
  { value: "weekdays", label: "工作日" }, { value: "weekly", label: "每周" },
];
const emptyDraft = { title: "", subject: "english" as FocusSubject, estimatedCycles: 1, repeatRule: "none" as FocusRepeatRule };

export interface FocusPlanBoardProps {
  localDate: string;
  initialPlans: FocusPlan[];
  service: FocusPlanService;
  onStartPlan(plan: FocusPlan): void;
  disabled?: boolean;
}

export function FocusPlanBoard({ localDate, initialPlans, service, onStartPlan, disabled = false }: FocusPlanBoardProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [editing, setEditing] = useState<FocusPlan | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setPlans(initialPlans), [initialPlans]);

  function openCreate() { setEditing(null); setDraft(emptyDraft); setFormOpen(true); setError(""); }
  function openEdit(plan: FocusPlan) { setEditing(plan); setDraft({ title: plan.title, subject: plan.subject, estimatedCycles: plan.estimatedCycles, repeatRule: plan.repeatRule }); setFormOpen(true); setError(""); }
  async function act(operation: () => Promise<void>) {
    setBusy(true); setError("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function save() {
    await act(async () => {
      const common = { localDate, title: draft.title.trim(), subject: draft.subject, estimatedCycles: draft.estimatedCycles, repeatRule: draft.repeatRule, linkedDailyTaskId: editing?.linkedDailyTaskId ?? null };
      const saved = editing ? await service.update({ ...common, id: editing.id, version: editing.version }) : await service.create(common);
      setPlans((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setFormOpen(false); setEditing(null); setDraft(emptyDraft);
    });
  }
  async function toggle(plan: FocusPlan) {
    await act(async () => { const saved = await service.setCompleted({ id: plan.id, version: plan.version, completed: !plan.completedAt }); setPlans((current) => current.map((item) => item.id === saved.id ? saved : item)); });
  }
  async function remove(plan: FocusPlan) {
    await act(async () => { await service.delete({ id: plan.id, version: plan.version }); setPlans((current) => current.filter((item) => item.id !== plan.id)); });
  }
  async function move(plan: FocusPlan, delta: -1 | 1) {
    const index = plans.findIndex((item) => item.id === plan.id); const target = index + delta;
    if (index < 0 || target < 0 || target >= plans.length) return;
    const ids = plans.map((item) => item.id); [ids[index], ids[target]] = [ids[target], ids[index]];
    await act(async () => setPlans(await service.reorder(localDate, ids)));
  }

  return <section className="focus-plan-board" aria-label="今日专注清单">
    <header className="focus-plan-board__header">
      <div><span className="eyebrow">TODAY / 今日</span><h2>专注任务票</h2><p>把今天真正需要计时推进的学习，排成一列。</p></div>
      <button className="focus-plan-board__add" disabled={busy || disabled} onClick={openCreate}><Plus size={17} />添加专注任务</button>
    </header>
    {error && <p className="focus-error" role="alert">{error}</p>}
    {formOpen && <div className="focus-plan-form" aria-label={editing ? "编辑专注任务" : "新建专注任务"}>
      <label>任务名称<input autoFocus maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>科目<select value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value as FocusSubject })}>{subjects.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>预计番茄数<input type="number" min={1} max={24} value={draft.estimatedCycles} onChange={(event) => setDraft({ ...draft, estimatedCycles: Number(event.target.value) })} /></label>
      <label>重复<select value={draft.repeatRule} onChange={(event) => setDraft({ ...draft, repeatRule: event.target.value as FocusRepeatRule })}>{repeats.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <div className="focus-plan-form__actions"><button className="primary-button" disabled={busy || !draft.title.trim() || draft.estimatedCycles < 1 || draft.estimatedCycles > 24} onClick={() => void save()}><Check size={16} />保存任务</button><button className="secondary-button" onClick={() => setFormOpen(false)}><X size={16} />取消</button></div>
    </div>}
    {plans.length ? <div className="focus-plan-tickets">{plans.map((plan, index) => {
      const subject = subjects.find((item) => item.value === plan.subject)?.label ?? "其他";
      const repeat = repeats.find((item) => item.value === plan.repeatRule)?.label;
      return <article key={plan.id} className={`focus-plan-ticket focus-plan-ticket--${plan.subject}${plan.completedAt ? " is-complete" : ""}`}>
        <div className="focus-plan-ticket__rail"><span>{String(index + 1).padStart(2, "0")}</span><small>{subject}</small></div>
        <div className="focus-plan-ticket__body"><div className="focus-plan-ticket__title"><h3>{plan.title}</h3>{plan.repeatRule !== "none" && <span><RotateCw size={12} />{repeat}</span>}</div><div className="focus-plan-cycles" aria-label={`已完成 ${plan.completedCycles} 个，共 ${plan.estimatedCycles} 个番茄`}>{Array.from({ length: plan.estimatedCycles }, (_, cycle) => <i key={cycle} className={cycle < plan.completedCycles ? "is-filled" : ""} />)}<small>{plan.completedCycles}/{plan.estimatedCycles}</small></div></div>
        <div className="focus-plan-ticket__actions">
          <button disabled={busy || disabled || !!plan.completedAt} aria-label={`开始 ${plan.title}`} onClick={() => onStartPlan(plan)}><Play size={16} /></button>
          <button disabled={busy || disabled} aria-label={`编辑 ${plan.title}`} onClick={() => openEdit(plan)}><Pencil size={15} /></button>
          <button disabled={busy || disabled} aria-label={`${plan.completedAt ? "恢复" : "完成"} ${plan.title}`} onClick={() => void toggle(plan)}><Check size={15} /></button>
          <button disabled={busy || index === 0} aria-label={`上移 ${plan.title}`} onClick={() => void move(plan, -1)}><ArrowUp size={15} /></button>
          <button disabled={busy || index === plans.length - 1} aria-label={`下移 ${plan.title}`} onClick={() => void move(plan, 1)}><ArrowDown size={15} /></button>
          <button disabled={busy || disabled} aria-label={`删除 ${plan.title}`} onClick={() => void remove(plan)}><Trash2 size={15} /></button>
        </div>
      </article>;
    })}</div> : !formOpen && <div className="focus-plan-empty"><span>01</span><h3>今天还没有专注任务</h3><p>先写下一件值得认真完成的小事。</p></div>}
  </section>;
}
