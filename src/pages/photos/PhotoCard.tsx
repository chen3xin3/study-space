import { useEffect, useRef, useState } from "react";
import { BookImage, Check, RotateCcw, Trash2 } from "lucide-react";
import type { PhotoArchiveService, PhotoKind, PhotoRecord } from "../../services/photo-archive/photo-archive.types";
import { photoThumbnailCache } from "./photo-thumbnail-cache";

const kindLabels: Record<PhotoKind, string> = { english: "英语", essay: "作文", other: "其他" };

export function PhotoThumbnail({ service, photo }: { service: PhotoArchiveService; photo: PhotoRecord }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!node.current || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "160px" });
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void photoThumbnailCache.get(photo.attachmentId, () => service.read(photo.attachmentId)).then((objectUrl) => {
      if (cancelled) return;
      setUrl(objectUrl);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [service, photo.attachmentId, visible]);
  return <span ref={node} className="photo-archive__placeholder">{url ? <img src={url} alt={photo.title || photo.originalName} loading="lazy" />
    : failed ? "原图缺失" : <BookImage aria-hidden="true" />}</span>;
}

interface PhotoCardProps {
  service: PhotoArchiveService;
  photo: PhotoRecord;
  trash: boolean;
  selectionMode: boolean;
  selected: boolean;
  busy: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onMemorized: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
}

export function PhotoCard({ service, photo, trash, selectionMode, selected, busy, onOpen, onSelect, onMemorized, onTrash, onRestore, onDeletePermanently }: PhotoCardProps) {
  const name = photo.title || photo.originalName;
  return <article className={`photo-archive__tile${selected ? " is-selected" : ""}`}>
    {selectionMode && <label className="photo-archive__select"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`选择${name}`} /></label>}
    <button type="button" className="photo-archive__image" onClick={selectionMode ? onSelect : onOpen} aria-label={selectionMode ? `选择${name}` : `查看${name}原图`}><PhotoThumbnail service={service} photo={photo} /></button>
    <div className="photo-archive__tile-body"><div><span>{kindLabels[photo.kind]}</span>{!photo.studyDateConfirmed && <span className="photo-archive__unconfirmed">日期待确认</span>}</div>
      <strong>{name}</strong>
      <div className="photo-archive__tile-actions">{trash ? <><button type="button" disabled={busy} aria-label={`恢复${name}`} onClick={onRestore}><RotateCcw size={14} />恢复</button><button type="button" className="is-danger" disabled={busy} aria-label={`永久删除${name}`} onClick={onDeletePermanently}><Trash2 size={14} />永久删除</button></> : <><button type="button" disabled={busy}
        aria-label={photo.memorized ? `取消${name}已背诵` : `标记${name}已背诵`}
        className={photo.memorized ? "photo-archive__memorized is-done" : "photo-archive__memorized"}
        onClick={onMemorized}><Check size={14} />{photo.memorized ? "已背诵" : "标记已背诵"}</button><button type="button" className="photo-archive__trash" disabled={busy} aria-label={`删除${name}`} onClick={onTrash}><Trash2 size={14} />删除</button></>}</div>
    </div>
  </article>;
}
