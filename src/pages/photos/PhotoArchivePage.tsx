import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookImage, Camera, ChevronLeft, ChevronRight, ImagePlus, ListChecks, Sparkles, Trash2, X } from "lucide-react";
import { MaterialSuggestionPanel, type MaterialSuggestionRow } from "../../components/ai/MaterialSuggestionPanel";
import { createAiService } from "../../services/ai/ai.service";
import { toAiServiceError } from "../../services/ai/ai.errors";
import type { AiService, PhotoOrganizationSuggestion } from "../../services/ai/ai.types";
import { createPhotoArchiveService } from "../../services/photo-archive/photo-archive.service";
import type { PhotoArchiveService, PhotoKind, PhotoRecord } from "../../services/photo-archive/photo-archive.types";
import { PhotoImportTray } from "./PhotoImportTray";
import { PhotoCard, PhotoThumbnail } from "./PhotoCard";
import { PhotoSelectionBar } from "./PhotoSelectionBar";
import { createImportQueue, markQueueItem, type PhotoImportQueueItem } from "./photo-import-queue";
import "./photo-archive.css";

const kinds: { value: PhotoKind | null; label: string }[] = [
  { value: null, label: "全部照片" }, { value: "english", label: "英语" },
  { value: "essay", label: "作文" }, { value: "other", label: "其他" },
];
const kindLabels: Record<PhotoKind, string> = { english: "英语", essay: "作文", other: "其他" };
function requestedPhotoKind(): PhotoKind | null {
  const value = new URLSearchParams(window.location.search).get("kind");
  return value === "english" || value === "essay" || value === "other" ? value : null;
}
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

interface PhotoArchivePageProps { service?: PhotoArchiveService; aiService?: AiService }

export function PhotoArchivePage({ service: suppliedService, aiService: suppliedAiService }: PhotoArchivePageProps) {
  const [service] = useState(() => suppliedService ?? createPhotoArchiveService());
  const [aiService] = useState(() => suppliedAiService ?? createAiService());
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [kind, setKind] = useState<PhotoKind | null>(requestedPhotoKind);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [error, setError] = useState("");
  const [aiErrorCode, setAiErrorCode] = useState("");
  const [photoSuggestion, setPhotoSuggestion] = useState<PhotoOrganizationSuggestion | null>(null);
  const [notice, setNotice] = useState("");
  const [importItems, setImportItems] = useState<PhotoImportQueueItem[]>([]);
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0, succeeded: 0, failed: 0 });
  const [studyDate, setStudyDate] = useState(todayKey);
  const [newKind, setNewKind] = useState<PhotoKind>(() => requestedPhotoKind() ?? "other");
  const [trash, setTrash] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undoBatch, setUndoBatch] = useState<PhotoRecord[]>([]);
  const [batchKind, setBatchKind] = useState<PhotoKind>("other");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editKind, setEditKind] = useState<PhotoKind>("other");
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const stopImportRef = useRef(false);
  const mountedRef = useRef(true);
  const today = todayKey();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (selectedKind: PhotoKind | null, inTrash: boolean, next: string | null = null) => {
    setLoading(true);
    try {
      const page = await service.list({ kind: selectedKind, trash: inTrash, cursor: next });
      setPhotos((current) => next ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
      setError("");
    } catch (caught) { setError(message(caught, "照片读取失败，请重试。")); }
    finally { setLoading(false); }
  }, [service]);

  useEffect(() => { setSelected(new Set()); setSelectionMode(false); setUndoBatch([]); void load(kind, trash); }, [kind, trash, load]);

  const groups = useMemo(() => {
    const result = new Map<string, PhotoRecord[]>();
    for (const photo of photos) result.set(photo.studyDate, [...(result.get(photo.studyDate) ?? []), photo]);
    return [...result.entries()];
  }, [photos]);

  const selectFiles = (list: FileList | null) => {
    if (!list) return;
    setImportItems(createImportQueue([...list]).items);
    setImportProgress({ completed: 0, total: 0, succeeded: 0, failed: 0 });
    setError("");
    setNotice("");
  };

  const save = async (mode: "pending" | "failed" = "pending") => {
    if (!importItems.length || busy) return;
    if (!studyDate || studyDate > today) { setError("学习日期不能晚于今天。"); return; }
    const candidates = importItems.filter((item) => mode === "failed"
      ? item.status === "failed"
      : item.status === "pending" || item.status === "skipped");
    if (!candidates.length) return;
    stopImportRef.current = false;
    setBusy(true); setError(""); setNotice("");
    setImportProgress({ completed: 0, total: candidates.length, succeeded: 0, failed: 0 });
    let saved = 0;
    let failed = 0;
    let completed = 0;
    for (let index = 0; index < candidates.length; index++) {
      const item = candidates[index];
      if (stopImportRef.current) {
        const remainingIds = new Set(candidates.slice(index).map((candidate) => candidate.id));
        if (mountedRef.current) setImportItems((current) => current.map((candidate) => remainingIds.has(candidate.id)
          ? { ...candidate, status: "skipped", error: "" }
          : candidate));
        break;
      }
      if (mountedRef.current) setImportItems((current) => markQueueItem(current, item.id, { status: "importing", error: "" }));
      try {
        const bytes = [...new Uint8Array(await item.file.arrayBuffer())];
        await service.importPhoto({ bytes, mediaType: item.file.type, originalName: item.file.name, studyDate,
          title: item.file.name.replace(/\.[^.]+$/, ""), kind: newKind });
        saved++;
        if (mountedRef.current) setImportItems((current) => markQueueItem(current, item.id, { status: "success", error: "" }));
      } catch (caught) {
        failed++;
        if (mountedRef.current) setImportItems((current) => markQueueItem(current, item.id, {
          status: "failed",
          error: message(caught, "保存失败，请重试。"),
        }));
      }
      completed++;
      if (mountedRef.current) setImportProgress({ completed, total: candidates.length, succeeded: saved, failed });
    }
    if (!mountedRef.current) return;
    setImportItems((current) => current.filter((item) => item.status !== "success"));
    if (saved) setNotice(`已保存 ${saved} 张照片，可在 ${dateLabel(studyDate)} 查看。`);
    if (failed) setError(`${failed} 张照片保存失败，可以单独重试。`);
    setBusy(false);
    if (saved) await load(kind, trash);
  };

  const changePhoto = async (photo: PhotoRecord, changes: { memorized?: boolean; studyDate?: string; title?: string; kind?: PhotoKind }) => {
    setBusy(true); setError("");
    try {
      const changed = await service.update({ attachmentId: photo.attachmentId, version: photo.version,
        studyDate: changes.studyDate ?? photo.studyDate, title: changes.title ?? photo.title,
        kind: changes.kind ?? photo.kind, memorized: changes.memorized ?? photo.memorized });
      setPhotos((current) => current.map((item) => item.attachmentId === changed.attachmentId ? changed : item)
        .sort((a, b) => b.studyDate.localeCompare(a.studyDate) || b.attachmentId.localeCompare(a.attachmentId)));
      setEditDate(changed.studyDate);
      setEditTitle(changed.title);
      setEditKind(changed.kind);
    } catch (caught) { setError(message(caught, "照片修改失败，请重试。")); }
    finally { setBusy(false); }
  };

  const toggleSelected = (attachmentId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(attachmentId)) next.delete(attachmentId); else next.add(attachmentId);
    return next;
  });

  const mutatePhotos = async (
    targets: PhotoRecord[],
    operation: (photo: PhotoRecord) => Promise<unknown>,
    successLabel: string,
  ) => {
    if (!targets.length || busy) return [];
    setBusy(true); setError(""); setNotice("");
    const results = await Promise.allSettled(targets.map(operation));
    const succeededResults = results.flatMap((result, index) => result.status === "fulfilled"
      ? [{ photo: targets[index], result: result.value }]
      : []);
    const succeeded = new Set(targets.filter((_, index) => results[index].status === "fulfilled").map((photo) => photo.attachmentId));
    const failed = targets.filter((_, index) => results[index].status === "rejected");
    setPhotos((current) => current.filter((photo) => !succeeded.has(photo.attachmentId)));
    setSelected(new Set(failed.map((photo) => photo.attachmentId)));
    if (openedId && succeeded.has(openedId)) setOpenedId(null);
    if (succeeded.size) setNotice(`${successLabel} ${succeeded.size} 张照片。`);
    if (failed.length) setError(`${failed.length} 张照片处理失败，请刷新后重试。`);
    setBusy(false);
    return succeededResults;
  };

  const selectedPhotos = photos.filter((photo) => selected.has(photo.attachmentId));
  const moveToTrash = async (targets: PhotoRecord[]) => {
    setUndoBatch([]);
    const succeeded = await mutatePhotos(targets, (photo) => service.setDeleted({ attachmentId: photo.attachmentId, version: photo.version, deleted: true }), "已移入回收站");
    setUndoBatch(succeeded.map(({ result }) => result as PhotoRecord));
  };
  const restore = (targets: PhotoRecord[]) => mutatePhotos(targets, (photo) => service.setDeleted({ attachmentId: photo.attachmentId, version: photo.version, deleted: false }), "已恢复");
  const undoMoveToTrash = async () => {
    if (!undoBatch.length || busy) return;
    setBusy(true); setError("");
    const results = await Promise.allSettled(undoBatch.map((photo) => service.setDeleted({ attachmentId: photo.attachmentId, version: photo.version, deleted: false })));
    const restored = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failed = undoBatch.filter((_, index) => results[index].status === "rejected");
    setPhotos((current) => [...current, ...restored].sort((a, b) => b.studyDate.localeCompare(a.studyDate) || b.attachmentId.localeCompare(a.attachmentId)));
    setUndoBatch(failed);
    if (restored.length) setNotice(`已撤销 ${restored.length} 张照片的删除。`);
    if (failed.length) setError(`${failed.length} 张照片撤销失败，请到回收站恢复。`);
    setBusy(false);
  };
  const deletePermanently = (targets: PhotoRecord[]) => {
    if (!targets.length || !window.confirm(`永久删除 ${targets.length} 张照片？此操作无法撤销。`)) return;
    void mutatePhotos(targets, (photo) => service.deletePermanently({ attachmentId: photo.attachmentId, version: photo.version }), "已永久删除");
  };
  const applyBatchKind = async (targets: PhotoRecord[]) => {
    if (!targets.length || busy) return;
    setBusy(true); setError(""); setNotice("");
    const results = await Promise.allSettled(targets.map((photo) => service.update({
      attachmentId: photo.attachmentId,
      version: photo.version,
      studyDate: photo.studyDate,
      title: photo.title,
      kind: batchKind,
      memorized: photo.memorized,
    })));
    const updated = new Map(results.flatMap((result) => result.status === "fulfilled" ? [[result.value.attachmentId, result.value] as const] : []));
    const failed = targets.filter((_, index) => results[index].status === "rejected");
    setPhotos((current) => current.map((photo) => updated.get(photo.attachmentId) ?? photo));
    setSelected(new Set(failed.map((photo) => photo.attachmentId)));
    if (updated.size) setNotice(`已更新 ${updated.size} 张照片的分类。`);
    if (failed.length) setError(`${failed.length} 张照片分类失败，请重试。`);
    setBusy(false);
  };

  const opened = photos.find((item) => item.attachmentId === openedId) ?? null;
  const openedIndex = photos.findIndex((item) => item.attachmentId === openedId);
  const openPhoto = (photo: PhotoRecord) => { setOpenedId(photo.attachmentId); setEditDate(photo.studyDate); setEditTitle(photo.title); setEditKind(photo.kind); setPhotoSuggestion(null); setAiErrorCode(""); setError(""); };
  const switchPhoto = (offset: number) => {
    const next = photos[openedIndex + offset];
    if (next) openPhoto(next);
  };

  const organizeOpenedPhoto = async () => {
    if (!opened || trash || organizing) return;
    setOrganizing(true); setError(""); setAiErrorCode("");
    try { setPhotoSuggestion(await aiService.organizePhotoMaterial({ attachmentId: opened.attachmentId })); }
    catch (caught) {
      const aiError = toAiServiceError(caught);
      setError(aiError.message); setAiErrorCode(aiError.code);
    } finally { setOrganizing(false); }
  };

  const photoSuggestionRows: MaterialSuggestionRow[] = opened && photoSuggestion ? [
    { id: "title", label: "照片标题", currentValue: opened.title, suggestedValue: photoSuggestion.title },
    { id: "kind", label: "资料类型", currentValue: kindLabels[opened.kind], suggestedValue: kindLabels[photoSuggestion.kind] },
    { id: "summary", label: "识别摘要", currentValue: "", suggestedValue: photoSuggestion.summary, multiline: true, applyable: false },
  ] : [];

  const applyPhotoSuggestion = (values: Record<string, string>) => {
    if (!opened || !photoSuggestion) return;
    const changes: { title?: string; kind?: PhotoKind } = {};
    if (values.title !== undefined) changes.title = values.title;
    if (values.kind !== undefined) changes.kind = photoSuggestion.kind;
    setPhotoSuggestion(null);
    if (Object.keys(changes).length) void changePhoto(opened, changes);
  };

  return <main className="page photo-archive">
    <header className="photo-archive__head">
      <div><span className="eyebrow">你的学习日记</span><h1>学习照片</h1><p>把纸上的内容按学习日期收好，不识别也能保存。</p></div>
      <div className="photo-archive__head-actions"><button type="button" className="secondary-button photo-archive__camera" onClick={() => cameraInput.current?.click()}><Camera size={17} />拍照</button>
        <button className="primary-button" type="button" onClick={() => galleryInput.current?.click()}><ImagePlus size={18} />导入照片</button></div>
    </header>
    <input ref={galleryInput} className="photo-archive__file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="从设备选择照片"
      onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="photo-archive__camera-input" aria-label="拍摄照片"
      onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
    {importItems.length > 0 && <PhotoImportTray items={importItems} progress={importProgress} studyDate={studyDate} kind={newKind} today={today} busy={busy}
      onStudyDateChange={setStudyDate} onKindChange={setNewKind}
      onRemove={(id) => setImportItems((current) => current.filter((item) => item.id !== id))}
      onCancel={() => { setImportItems([]); setImportProgress({ completed: 0, total: 0, succeeded: 0, failed: 0 }); }}
      onStop={() => { stopImportRef.current = true; }} onRetry={() => void save("failed")} onSave={() => void save()} />}
    <section className="photo-archive__workspace" aria-label="按学习日期浏览照片">
      <aside className="photo-archive__rail" aria-label="照片分类">
        <span>资料分类</span>
        {kinds.map((item) => <button key={item.label} type="button" className={kind === item.value ? "is-active" : ""}
          aria-pressed={kind === item.value} onClick={() => setKind(item.value)}>{item.label}</button>)}
      </aside>
      <div className="photo-archive__main">
        <div className="photo-archive__toolbar"><div><strong>{trash ? "照片回收站" : "按日期回看"}</strong><span>{trash ? "可恢复误删照片，或永久删除" : "每张照片的学习日期都可以修改"}</span></div>
          <div className="photo-archive__toolbar-actions"><span className="photo-archive__count">已载入 {photos.length} 张</span><button type="button" className="secondary-button" onClick={() => { setSelectionMode((value) => !value); setSelected(new Set()); }}><ListChecks size={16} />{selectionMode ? "退出管理" : "批量管理"}</button>
            <button type="button" className="secondary-button" onClick={() => setTrash((value) => !value)}>{trash ? "返回照片" : "回收站"}</button></div></div>
        {selectionMode && <PhotoSelectionBar selectedCount={selected.size} totalCount={photos.length} trash={trash} busy={busy} category={batchKind}
          onSelectAll={() => setSelected(new Set(photos.map((photo) => photo.attachmentId)))} onClear={() => { setSelected(new Set()); setSelectionMode(false); }}
          onMoveToTrash={() => void moveToTrash(selectedPhotos)} onRestore={() => void restore(selectedPhotos)} onDeletePermanently={() => deletePermanently(selectedPhotos)}
          onCategoryChange={setBatchKind} onApplyCategory={() => void applyBatchKind(selectedPhotos)} />}
        {error && !aiErrorCode && <div className="data-error" role="alert">{error}</div>}
        {notice && <div className="notice" role="status"><span>{notice}</span>{undoBatch.length > 0 && !trash && <button type="button" className="secondary-button" disabled={busy} onClick={() => void undoMoveToTrash()}>撤销移入回收站</button>}</div>}
        {loading && !photos.length && <p>正在读取照片…</p>}
        {!loading && !photos.length && <div className="photo-archive__empty"><BookImage size={38} /><h2>还没有学习照片</h2><p>导入纸上的笔记或作文，选好学习日期后就能在这里找到。</p></div>}
        {groups.map(([date, items]) => <section className="photo-archive__day" key={date}>
          <div className="photo-archive__day-head"><div><span>{date.slice(0, 4)} 年</span><h2>{dateLabel(date)}</h2></div><small>{items.length} 张 · 已背诵 {items.filter((item) => item.memorized).length}</small></div>
          <div className="photo-archive__grid">{items.map((photo) => <PhotoCard key={photo.attachmentId} service={service} photo={photo} trash={trash} selectionMode={selectionMode}
            selected={selected.has(photo.attachmentId)} busy={busy} onOpen={() => openPhoto(photo)} onSelect={() => toggleSelected(photo.attachmentId)}
            onMemorized={() => void changePhoto(photo, { memorized: !photo.memorized })} onTrash={() => void moveToTrash([photo])}
            onRestore={() => void restore([photo])} onDeletePermanently={() => deletePermanently([photo])} />)}</div>
        </section>)}
        {cursor && <button type="button" className="secondary-button photo-archive__more" disabled={loading} onClick={() => void load(kind, trash, cursor)}>{loading ? "加载中…" : "加载更多照片"}</button>}
      </div>
    </section>
    {opened && <div className="photo-archive__overlay" role="presentation" onClick={() => setOpenedId(null)}><section role="dialog" aria-modal="true" aria-label="照片原图" className="photo-archive__dialog" onClick={(event) => event.stopPropagation()}>
      <div className="photo-archive__dialog-head"><div><strong>{opened.title || opened.originalName}</strong><span>{dateLabel(opened.studyDate)} · {kindLabels[opened.kind]}</span></div><button type="button" className="secondary-button" aria-label="关闭原图" onClick={() => setOpenedId(null)}><X size={18} /></button></div>
      <div className="photo-archive__dialog-image"><button type="button" aria-label="上一张" disabled={openedIndex <= 0} onClick={() => switchPhoto(-1)}><ChevronLeft /></button><PhotoThumbnail service={service} photo={opened} /><button type="button" aria-label="下一张" disabled={openedIndex >= photos.length - 1} onClick={() => switchPhoto(1)}><ChevronRight /></button></div>
      {error && aiErrorCode ? <div className="photo-archive__dialog-error" role="alert"><span>{error}</span>{aiErrorCode === "AI_DISABLED" || aiErrorCode === "AI_NOT_CONFIGURED" ? <a href="/settings#ai-assistant">前往 AI 设置</a> : null}</div> : null}
      <div className="photo-archive__dialog-foot">{!trash && <><button type="button" className="secondary-button photo-archive__ai-action" disabled={busy || organizing} onClick={() => void organizeOpenedPhoto()}><Sparkles size={16} />{organizing ? "正在整理…" : "AI 整理"}</button><label>学习日期<input type="date" max={today} value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label><label>照片标题<input value={editTitle} maxLength={120} onChange={(event) => setEditTitle(event.target.value)} /></label><label>资料类型<select value={editKind} onChange={(event) => setEditKind(event.target.value as PhotoKind)}><option value="other">其他</option><option value="english">英语</option><option value="essay">作文</option></select></label><button type="button" className="primary-button" disabled={busy || (editDate === opened.studyDate && editTitle === opened.title && editKind === opened.kind && opened.studyDateConfirmed)} onClick={() => void changePhoto(opened, { studyDate: editDate, title: editTitle, kind: editKind })}>保存修改</button><button type="button" className="danger-button" disabled={busy} onClick={() => void moveToTrash([opened])}><Trash2 size={15} />移入回收站</button>{!opened.studyDateConfirmed && <span>这张旧照片的日期尚未由你确认</span>}</>}
        {trash && <><button type="button" className="secondary-button" disabled={busy} onClick={() => void restore([opened])}>恢复照片</button><button type="button" className="danger-button" disabled={busy} onClick={() => deletePermanently([opened])}>永久删除</button></>}</div>
    </section></div>}
    {photoSuggestion ? <MaterialSuggestionPanel rows={photoSuggestionRows} busy={busy} onCancel={() => setPhotoSuggestion(null)} onApply={applyPhotoSuggestion} /> : null}
  </main>;
}
