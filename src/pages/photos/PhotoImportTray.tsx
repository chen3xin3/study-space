import { useEffect, useState } from "react";
import { RotateCcw, StopCircle, Trash2, X } from "lucide-react";
import type { PhotoKind } from "../../services/photo-archive/photo-archive.types";
import type { PhotoImportQueueItem } from "./photo-import-queue";

interface PhotoImportTrayProps {
  items: PhotoImportQueueItem[];
  progress: { completed: number; total: number; succeeded: number; failed: number };
  studyDate: string;
  kind: PhotoKind;
  today: string;
  busy: boolean;
  onStudyDateChange: (value: string) => void;
  onKindChange: (value: PhotoKind) => void;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onStop: () => void;
  onRetry: () => void;
  onSave: () => void;
}

const statusLabels: Record<PhotoImportQueueItem["status"], string> = {
  pending: "等待保存",
  importing: "正在保存",
  success: "已保存",
  failed: "保存失败",
  rejected: "无法导入",
  skipped: "已停止",
};

export function PhotoImportTray({ items, progress, studyDate, kind, today, busy, onStudyDateChange, onKindChange, onRemove, onCancel, onStop, onRetry, onSave }: PhotoImportTrayProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const failedCount = items.filter((item) => item.status === "failed").length;
  const pendingCount = items.filter((item) => item.status === "pending" || item.status === "skipped").length;

  useEffect(() => {
    const entries = items.map((item) => [item.id, URL.createObjectURL(item.file)] as const);
    setPreviews(Object.fromEntries(entries));
    return () => entries.forEach(([, url]) => URL.revokeObjectURL(url));
  }, [items]);

  return <section className="photo-import-tray" aria-label="待导入照片">
    <div className="photo-import-tray__head">
      <div><strong>待处理 {items.length} 张</strong><span>保存前可以移除不需要的照片</span></div>
      {busy ? <button type="button" className="secondary-button" onClick={onStop}><StopCircle size={16} />停止后续导入</button>
        : <button type="button" className="secondary-button" onClick={onCancel}><X size={16} />取消整批</button>}
    </div>
    {(busy || progress.completed > 0) && <div className="photo-import-tray__progress" role="status"><strong>{busy ? `正在处理 ${progress.completed} / ${progress.total}` : `已处理 ${progress.completed} / ${progress.total}`}</strong><span>成功 {progress.succeeded} · 失败 {progress.failed}</span></div>}
    <div className="photo-import-tray__files">
      {items.map((item) => <article key={item.id} data-status={item.status}>
        {previews[item.id] && <img src={previews[item.id]} alt="" />}
        <div className="photo-import-tray__file-info"><span title={item.file.name}>{item.file.name}</span><small>{item.error || statusLabels[item.status]}</small></div>
        <button type="button" disabled={busy || item.status === "importing" || item.status === "success"} aria-label={`移除 ${item.file.name}`} onClick={() => onRemove(item.id)}><Trash2 size={15} /></button>
      </article>)}
    </div>
    <div className="photo-import-tray__fields">
      <label>学习日期<input aria-label="这一批的学习日期" type="date" max={today} value={studyDate} disabled={busy} onChange={(event) => onStudyDateChange(event.target.value)} /></label>
      <label>资料类型<select aria-label="资料类型" value={kind} disabled={busy} onChange={(event) => onKindChange(event.target.value as PhotoKind)}><option value="other">其他</option><option value="english">英语</option><option value="essay">作文</option></select></label>
      {failedCount > 0 && !busy && <button type="button" className="secondary-button" onClick={onRetry}><RotateCcw size={16} />重试失败项</button>}
      <button type="button" className="primary-button" aria-label="保存到照片资料库" disabled={busy || pendingCount === 0} onClick={onSave}>{busy ? "正在保存…" : `保存 ${pendingCount} 张照片`}</button>
    </div>
  </section>;
}
