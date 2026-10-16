import { useMemo, useState } from "react";
import { createPhotoRecord, permanentlyRemovePhoto, restorePhoto, trashPhoto, type ObjectUrlAdapter, type PhotoRecord } from "../domain/photos";

const browserUrls: ObjectUrlAdapter = { create: (file) => URL.createObjectURL(file), revoke: (url) => URL.revokeObjectURL(url) };

export function PhotosPage() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [category, setCategory] = useState("英语试卷");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"active" | "trash">("active");
  const visible = useMemo(() => photos.filter((photo) => mode === "trash" ? photo.deletedAt : !photo.deletedAt), [photos, mode]);

  function selectFiles(files: FileList | null) {
    if (!files) return;
    const created = Array.from(files).map((file) => createPhotoRecord(file, date, category, browserUrls));
    setPhotos((current) => [...created, ...current]);
  }

  return <section className="photos-page">
    <header className="page-heading"><div><p className="eyebrow">原始资料</p><h1>学习照片</h1><p>按日期和分类保存试卷、错题与手写资料。</p></div></header>
    <div className="photo-import panel">
      <label className="file-picker"><strong>选择学习照片</strong><span>支持 JPG、PNG、WebP，单张不超过 10MB</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => selectFiles(event.target.files)} /></label>
      <label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>分类<select value={category} onChange={(event) => setCategory(event.target.value)}><option>英语试卷</option><option>英语单词</option><option>英语作文</option><option>数学错题</option><option>政治资料</option><option>专业课资料</option></select></label>
    </div>
    <div className="segmented"><button className={mode === "active" ? "selected" : ""} onClick={() => setMode("active")}>照片库</button><button className={mode === "trash" ? "selected" : ""} onClick={() => setMode("trash")}>回收站</button></div>
    {visible.length === 0 ? <p className="empty-state">还没有照片。选择一张练习用图片开始。</p> : <div className="photo-grid">{visible.map((photo) => <article className="photo-card" key={photo.id}><img src={photo.previewUrl} alt={photo.originalName} /><div><span>{photo.capturedDate} · {photo.category}</span><strong>{photo.originalName}</strong>{mode === "active" ? <button onClick={() => setPhotos((items) => trashPhoto(items, photo.id))}>移到回收站</button> : <><button onClick={() => setPhotos((items) => restorePhoto(items, photo.id))}>恢复</button><button className="danger-link" onClick={() => setPhotos((items) => permanentlyRemovePhoto(items, photo.id, window.confirm("确定永久删除？"), browserUrls))}>永久删除</button></>}</div></article>)}</div>}
  </section>;
}
