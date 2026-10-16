import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Sparkles, X } from "lucide-react";
import "./material-suggestion.css";

export interface MaterialSuggestionRow {
  id: string;
  label: string;
  currentValue: string;
  suggestedValue: string;
  multiline?: boolean;
  selectedByDefault?: boolean;
  applyable?: boolean;
}

interface MaterialSuggestionPanelProps {
  rows: MaterialSuggestionRow[];
  busy?: boolean;
  onApply: (values: Record<string, string>) => void;
  onCancel: () => void;
  onSkip?: () => void;
}

export function MaterialSuggestionPanel({ rows, busy = false, onApply, onCancel, onSkip }: MaterialSuggestionPanelProps) {
  const visibleRows = useMemo(() => rows.filter((row) =>
    row.applyable === false ? Boolean(row.suggestedValue.trim()) : row.currentValue.trim() !== row.suggestedValue.trim(),
  ), [rows]);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(
    visibleRows.filter((row) => row.applyable !== false).map((row) => [row.id, row.selectedByDefault !== false]),
  ));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    visibleRows.map((row) => [row.id, row.suggestedValue]),
  ));
  const [copied, setCopied] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onCancel]);

  const apply = () => onApply(Object.fromEntries(
    visibleRows
      .filter((row) => row.applyable !== false && selected[row.id])
      .map((row) => [row.id, values[row.id] ?? ""]),
  ));

  const copy = async (row: MaterialSuggestionRow) => {
    await navigator.clipboard?.writeText(values[row.id] ?? row.suggestedValue);
    setCopied(row.id);
  };

  return <div className="material-suggestion-backdrop" role="presentation">
    <section className="material-suggestion-panel" role="dialog" aria-modal="true" aria-labelledby="material-suggestion-title">
      <header className="material-suggestion-panel__header">
        <div className="material-suggestion-panel__title-mark"><Sparkles aria-hidden="true" /></div>
        <div><span>整理当前资料</span><h2 id="material-suggestion-title" ref={headingRef} tabIndex={-1}>AI 整理建议</h2><p>确认后才会修改资料，可以只采用其中几项。</p></div>
        <button type="button" className="material-suggestion-panel__close" aria-label="关闭 AI 整理建议" onClick={onCancel}><X aria-hidden="true" /></button>
      </header>

      <div className="material-suggestion-panel__body">
        {visibleRows.length ? visibleRows.map((row) => <article className="material-suggestion-row" key={row.id}>
          <div className="material-suggestion-row__heading">
            <strong>{row.label}</strong>
            {row.applyable === false
              ? <button type="button" className="material-suggestion-row__copy" aria-label={`复制${row.label}`} onClick={() => void copy(row)}><Copy aria-hidden="true" />{copied === row.id ? "已复制" : "复制"}</button>
              : <label className="material-suggestion-row__toggle"><input type="checkbox" aria-label={`应用${row.label}`} checked={Boolean(selected[row.id])} onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.checked }))} /><span>{selected[row.id] ? "采用" : "不采用"}</span></label>}
          </div>
          <div className="material-suggestion-row__compare">
            {row.currentValue ? <div className="material-suggestion-row__current"><small>当前</small><p>{row.currentValue}</p></div> : null}
            <label className="material-suggestion-row__proposal"><small>{row.applyable === false ? "识别摘要" : "建议"}</small>
              {row.multiline
                ? <textarea aria-label={`${row.label}建议`} rows={4} readOnly={row.applyable === false} value={values[row.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [row.id]: event.target.value }))} />
                : <input aria-label={`${row.label}建议`} readOnly={row.applyable === false} value={values[row.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [row.id]: event.target.value }))} />}
            </label>
          </div>
        </article>) : <p className="material-suggestion-panel__empty">这条资料已经很清楚，没有需要修改的项目。</p>}
      </div>

      <footer className="material-suggestion-panel__actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>取消</button>
        {onSkip ? <button type="button" className="secondary-button" onClick={onSkip} disabled={busy}>跳过这条</button> : null}
        <button type="button" className="primary-button" onClick={apply} disabled={busy || !visibleRows.some((row) => row.applyable !== false && selected[row.id])}><Check aria-hidden="true" />{busy ? "正在应用…" : "应用所选建议"}</button>
      </footer>
    </section>
  </div>;
}
