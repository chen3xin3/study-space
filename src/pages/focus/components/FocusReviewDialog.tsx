import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, Sparkles, X } from "lucide-react";

export interface FocusReviewDialogProps {
  open: boolean;
  busy: boolean;
  error?: string;
  goal: string;
  hasPlan: boolean;
  effectiveSeconds: number;
  interruptionCount: number;
  defaultCompletedCycles: number;
  onClose(): void;
  onSubmit(input: { planCompleted: boolean; completedCycles: number; focusRating: number; note: string }): void | Promise<void>;
}

export function FocusReviewDialog({ open, busy, error = "", goal, hasPlan, effectiveSeconds, interruptionCount, defaultCompletedCycles, onClose, onSubmit }: FocusReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [planCompleted, setPlanCompleted] = useState(false);
  const [completedCycles, setCompletedCycles] = useState(defaultCompletedCycles);
  const [note, setNote] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const priorFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open && !wasOpen.current) {
      priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRating(0); setPlanCompleted(false); setCompletedCycles(defaultCompletedCycles); setNote("");
    } else if (!open && wasOpen.current) priorFocus.current?.focus();
    wasOpen.current = open;
  }, [defaultCompletedCycles, open]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);
  if (!open) return null;
  return <div className="focus-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="focus-dialog focus-review-dialog" role="dialog" aria-modal="true" aria-labelledby="focus-review-title">
      <button ref={closeButton} className="focus-dialog__close" aria-label="关闭复盘窗口" disabled={busy} onClick={onClose}><X size={18} /></button>
      <header><span><Sparkles size={16} /> SESSION REVIEW</span><h2 id="focus-review-title">给这一段专注画个句号</h2><p>{goal || "自由学习"}</p></header>
      <div className="focus-review-stats"><div><Clock3 size={18} /><small>有效学习</small><strong>{Math.floor(effectiveSeconds / 60)} 分钟</strong></div><div><RotateCcw size={18} /><small>完成轮次</small><strong>{defaultCompletedCycles} 轮</strong></div><div><Sparkles size={18} /><small>中断记录</small><strong>{interruptionCount} 次中断</strong></div></div>
      <fieldset className="focus-rating"><legend>这次的专注状态怎么样？</legend>{[1, 2, 3, 4, 5].map((value) => <label key={value} className={rating === value ? "is-active" : ""}><input type="radio" name="focus-rating" checked={rating === value} aria-label={`专注评分 ${value} 分`} disabled={busy} onChange={() => setRating(value)} /><span>{value}</span></label>)}</fieldset>
      <div className="focus-review-options">
        <label>完成轮数<input type="number" min={0} max={99} value={completedCycles} disabled={busy} onChange={(event) => setCompletedCycles(Math.max(0, Number(event.target.value)))} /></label>
        {hasPlan && <label className="focus-review-complete"><input type="checkbox" checked={planCompleted} disabled={busy} onChange={(event) => setPlanCompleted(event.target.checked)} /><CheckCircle2 size={17} />这次完成了计划</label>}
      </div>
      <label className="focus-dialog__note">复盘笔记<textarea aria-label="复盘笔记" value={note} maxLength={300} disabled={busy} placeholder="可选：做得好的地方、下次想调整的地方……" onChange={(event) => setNote(event.target.value)} /><small aria-hidden="true">{note.length}/300</small></label>
      {error && <p className="focus-dialog__error" role="alert">{error}</p>}
      <footer><button className="secondary-button" disabled={busy} onClick={onClose}>取消复盘</button><button className="primary-button" disabled={busy || rating === 0} onClick={() => void onSubmit({ planCompleted, completedCycles, focusRating: rating, note: note.trim() })}>确认结束</button></footer>
    </section>
  </div>;
}
