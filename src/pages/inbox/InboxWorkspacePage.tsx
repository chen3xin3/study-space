import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Folder, FolderPlus, Image, Inbox, Plus, Trash2, Upload } from "lucide-react";
import { createInboxService } from "../../services/inbox/inbox.service";
import type { InboxFolder, InboxItem } from "../../services/inbox/inbox.types";
import "./inbox-workspace.css";

const service = createInboxService();
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : String(error);

export function InboxWorkspacePage() {
  const [folders, setFolders] = useState<InboxFolder[]>([]);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<"folder" | "rename" | "note" | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [preview, setPreview] = useState<{ name: string; mediaType: string; url: string; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  const refresh = useCallback(async () => {
    const [folders, items] = await Promise.all([service.listFolders(), service.listItems(folder, trash)]);
    setFolders(folders); setItems(items);
    setHasMore(items.length === 100);
  }, [folder, trash]);
  useEffect(() => { void refresh().catch((error) => setError(errorText(error))); }, [refresh]);
  async function act(fn: () => Promise<unknown>) { setBusy(true); setError(""); try { await fn(); await refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    await act(async () => { for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20 MB`);
      await service.importFile({ name: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())), folderId: folder });
    } });
    if (input.current) input.current.value = "";
  }
  async function openFile(item: InboxItem) {
    await act(async () => {
      const file = await service.readFile(item.id);
      if (file.mediaType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const text = file.mediaType === "text/plain" ? new TextDecoder().decode(Uint8Array.from(file.bytes)) : "";
        const url = text ? "" : URL.createObjectURL(new Blob([Uint8Array.from(file.bytes)], { type: file.mediaType }));
        setPreview({ name: file.name, mediaType: file.mediaType, url, text });
        return;
      }
      const url = URL.createObjectURL(new Blob([Uint8Array.from(file.bytes)], { type: file.mediaType }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }
  async function loadMore() {
    setBusy(true); setError("");
    try { const next = await service.listItems(folder, trash, items.length); setItems((current) => [...current, ...next]); setHasMore(next.length === 100); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  const visible = filter === "all" ? items : items.filter((item) => item.kind === filter);
  return <div className="page inbox-page">
    <header className="inbox-header"><div><span className="eyebrow">资料工作台 / LIBRARY</span><h1>收件箱</h1><p>先收集，再整理。照片、文档和临时笔记都放得下。</p></div><button className="primary-button" disabled={busy || trash} onClick={() => input.current?.click()}><Upload size={16} />导入文件</button><input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.docx,.txt,.md" hidden onChange={(event) => void importFiles(event.target.files)} /></header>
    <p className="inbox-safety">导入时复制到应用内，原文件不会被移动或删除。支持图片、PDF、Word、TXT、Markdown；单个文件不超过 20 MB。</p>
    {error && <p className="focus-error" role="alert">{error}</p>}
    <div className="inbox-workspace"><aside className="inbox-folders"><div className="inbox-folders__heading"><strong>资料夹</strong><button title="新建资料夹" onClick={() => { setName(""); setForm("folder"); }}><FolderPlus size={18} /></button></div><button className={!folder && !trash ? "is-active" : ""} onClick={() => { setFolder(null); setTrash(false); }}><Inbox size={17} />未整理</button>{folders.map((entry) => <button key={entry.id} className={folder === entry.id && !trash ? "is-active" : ""} onClick={() => { setFolder(entry.id); setTrash(false); }}><Folder size={17} /><span>{entry.name}</span><small>{entry.itemCount}</small></button>)}<button className={trash ? "is-active" : ""} onClick={() => { setFolder(null); setTrash(true); }}><Trash2 size={17} />最近移除</button></aside>
      <section className="inbox-main"><div className="inbox-main__heading"><div><span>当前位置</span><h2>{trash ? "最近移除" : folder ? folders.find((entry) => entry.id === folder)?.name ?? "资料夹" : "未整理"}</h2></div><div>{folder && !trash && <button className="secondary-button" onClick={() => { const current = folders.find((entry) => entry.id === folder); setName(current?.name ?? ""); setForm("rename"); }}>重命名</button>}{!trash && <button className="secondary-button" onClick={() => { setName(""); setBody(""); setForm("note"); }}><Plus size={16} />写笔记</button>}</div></div>
      {form && <form className="inbox-note-form" onSubmit={(event) => { event.preventDefault(); void act(async () => { if (form === "folder") await service.createFolder(name); else if (form === "rename") { const current = folders.find((entry) => entry.id === folder); if (current) await service.renameFolder({ id: current.id, version: current.version, name }); } else await service.createNote({ title: name, note: body, folderId: folder }); setForm(null); }); }}><input autoFocus required maxLength={100} placeholder={form === "note" ? "笔记标题" : "资料夹名称"} value={name} onChange={(event) => setName(event.target.value)} />{form === "note" && <textarea required maxLength={20000} rows={4} placeholder="先记下来…" value={body} onChange={(event) => setBody(event.target.value)} />}<div><button className="primary-button" disabled={busy}>保存</button><button className="secondary-button" type="button" onClick={() => setForm(null)}>取消</button></div></form>}
      <div className="inbox-filter">{[["all", "全部"], ["image", "图片"], ["document", "文档"], ["note", "笔记"]].map(([key, label]) => <button key={key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
      {visible.length ? <div className="inbox-list">{visible.map((item) => <article className="inbox-item" key={item.id}><div className="inbox-item__icon">{item.kind === "image" ? <Image /> : <FileText />}</div><div className="inbox-item__body"><strong>{item.title}</strong><small>{item.kind === "note" ? "临时笔记" : item.originalName} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</small>{item.kind === "note" && <p>{item.note}</p>}</div><div className="inbox-item__actions">{item.kind !== "note" && !trash && <button onClick={() => void openFile(item)}>{item.mediaType?.includes("wordprocessingml") ? "下载 Word" : "打开"}</button>}{!trash && <select aria-label={`移动${item.title}到资料夹`} value={item.folderId ?? ""} onChange={(event) => void act(() => service.moveItem({ id: item.id, version: item.version, folderId: event.target.value || null }))}><option value="">未整理</option>{folders.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>}<button onClick={() => void act(() => service.setDeleted({ id: item.id, version: item.version }, !trash))}>{trash ? "恢复" : "移除"}</button></div></article>)}</div> : <div className="inbox-empty-new"><Folder size={34} /><h3>{trash ? "没有移除的资料" : "这里还没有资料"}</h3><p>{trash ? "移除的资料可以在这里恢复。" : "导入文件或添加笔记，然后整理到资料夹。"}</p>{!trash && <button className="primary-button" onClick={() => input.current?.click()}><Upload size={16} />添加资料</button>}</div>}
      {hasMore && <button className="secondary-button inbox-more" disabled={busy} onClick={() => void loadMore()}>加载更多资料</button>}
      </section></div>
    {preview && <div className="inbox-preview-overlay" role="presentation" onClick={() => setPreview(null)}><section className="inbox-preview" role="dialog" aria-modal="true" aria-label={preview.name} onClick={(event) => event.stopPropagation()}><header><strong>{preview.name}</strong><button className="secondary-button" onClick={() => setPreview(null)}>关闭</button></header>{preview.mediaType.startsWith("image/") ? <img src={preview.url} alt={preview.name} /> : preview.mediaType === "application/pdf" ? <iframe title={preview.name} src={preview.url} /> : <pre>{preview.text}</pre>}</section></div>}
  </div>;
}
