import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Pause, Play, X } from "lucide-react";
import type { FocusInterruptionReason } from "../../../services/focus/focus.types";

const reasons: Array<{ value: FocusInterruptionReason; label: string; mark: string }> = [
  { value: "phone", label: "手机消息", mark: "01" },
  { value: "urgent", label: "临时急事", mark: "02" },
  { value: "environment", label: "环境干扰", mark: "03" },
  { value: "physical", label: "身体状态", mark: "04" },
  { value: "other", label: "其他原因", mark: "05" },
];

export interface FocusInterruptionDialogProps {
  open: boolean;
  busy: boolean;
  error?: string;
  onClose(): void;
  onSubmit(input: { reason: FocusInterruptionReason; note: string; pause: boolean }): void | Promise<void>;
}

export function FocusInterruptionDialog({ open, busy, error = "", onClose, onSubmit }: FocusInterruptionDialogProps) {
  const [reason, setReason] = useState<FocusInterruptionReason>("phone");
  const [note, setNote] = useState("");
  const firstControl = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const priorFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open && !wasOpen.current) {
      priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReason("phone"); setNote("");
    } else if (!open && wasOpen.current) priorFocus.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    firstControl.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);
  if (!open) return null;
  const submit = (pause: boolean) => void onSubmit({ reason, note: note.trim(), pause });
  return <div className="focus-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="focus-dialog focus-interruption-dialog" role="dialog" aria-modal="true" aria-labelledby="focus-interruption-title">
      <button className="focus-dialog__close" aria-label="关闭中断记录" disabled={busy} onClick={onClose}><X size={18} /></button>
      <header><span><AlertTriangle size={16} /> INTERRUPTION LOG</span><h2 id="focus-interruption-title">刚才是什么打断了你？</h2><p>记一下就好，不批评自己。数据会帮你找到更安静的节奏。</p></header>
      <div className="focus-reason-grid">
        {reasons.map((item, index) => <label key={item.value} className={reason === item.value ? "is-active" : ""}><input ref={index === 0 ? firstControl : undefined} type="radio" name="focus-interruption-reason" value={item.value} aria-label={item.label} checked={reason === item.value} disabled={busy} onChange={() => setReason(item.value)} /><span>{item.mark}</span><strong>{item.label}</strong></label>)}
      </div>
      <label className="focus-dialog__note">补充说明<textarea aria-label="补充说明" value={note} maxLength={120} disabled={busy} placeholder="可选，例如：楼下施工、临时接电话……" onChange={(event) => setNote(event.target.value)} /><small aria-hidden="true">{note.length}/120</small></label>
      {error && <p className="focus-dialog__error" role="alert">{error}</p>}
      <footer><button className="secondary-button" disabled={busy} onClick={() => submit(true)}><Pause size={16} />记录并暂停</button><button className="primary-button" disabled={busy} onClick={() => submit(false)}><Play size={16} />记录并继续</button></footer>
    </section>
  </div>;
}
