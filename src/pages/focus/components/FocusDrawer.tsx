import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";

export interface FocusDrawerProps { open: boolean; title: string; children: ReactNode; onClose(): void }

export function FocusDrawer({ open, title, children, onClose }: FocusDrawerProps) {
  const titleId = useId();
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose, open]);
  if (!open) return null;
  return <div className="focus-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="focus-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}><header><h2 id={titleId}>{title}</h2><button aria-label="关闭" onClick={onClose}><X /></button></header><div className="focus-drawer__content">{children}</div></section></div>;
}
