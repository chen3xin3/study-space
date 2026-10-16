import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Info, Play } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { PageHeader } from "../../components/ui/PageHeader";
import { ImageDropzone } from "../../components/vocabulary-import/ImageDropzone";
import { ImageThumbnailList, type SelectedImportImage } from "../../components/vocabulary-import/ImageThumbnailList";
import type { AttachmentRecord, DataService } from "../../services/data/data.types";
import { createVocabularyImportService } from "../../services/vocabulary-import/vocabulary-import.service";
import type { ImportSessionDetail, VocabularyImportService } from "../../services/vocabulary-import/vocabulary-import.types";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

interface Props { dataService?: DataService; importService?: VocabularyImportService }

export function VocabularyImportPage({ importService: suppliedImport }: Props) {
  const [importService] = useState(() => suppliedImport ?? createVocabularyImportService());
  const [images, setImages] = useState<SelectedImportImage[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openSession, setOpenSession] = useState<ImportSessionDetail | null>(null);
  const navigate = useNavigate();

  useEffect(() => { void importService.listOpenSessions().then((items) => setOpenSession(items[0] ?? null)).catch(() => undefined); }, [importService]);

  const add = (attachment: AttachmentRecord) => {
    if (!TYPES.has(attachment.mediaType) || attachment.byteSize <= 0 || attachment.byteSize > MAX_BYTES) {
      setError("只支持 10 MB 以内的 PNG、JPG 或 WebP 图片。"); return;
    }
    setImages((current) => current.some((item) => item.attachment.id === attachment.id) ? current : current.length >= 4 ? current : [...current, { attachment, rotationDegrees: 0 }]);
  };

  const addFiles = async (files: File[]) => {
    setError("");
    if (images.length + files.length > 4) { setError("一次最多选择 4 张照片。"); return; }
    for (const file of files) {
      if (!TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) { setError("只支持 10 MB 以内的 PNG、JPG 或 WebP 图片。"); return; }
      try { add(await importService.importClipboardImage([...new Uint8Array(await file.arrayBuffer())], file.type)); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "照片导入失败。"); return; }
    }
  };

  const start = async () => {
    setBusy(true); setError("");
    try {
      let session = await importService.createSession(images.map((item) => item.attachment.id));
      for (const image of images.filter((item) => item.rotationDegrees)) {
        session = await importService.rotateImage(session.id, image.attachment.id, session.version, image.rotationDegrees);
      }
      session = await importService.recognize(session.id, session.version);
      navigate(`/english/words/import/${session.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "识别未能开始。"); }
    finally { setBusy(false); }
  };

  return (
    <main className="page vocabulary-import-page">
      <PageHeader eyebrow="英语 · 资料录入" title="拍照导入单词" description="拍下或选择单词纸照片，核对识别结果后保存到资料库。" />
      {openSession ? <Notice><div className="resume-import"><span>发现一条未完成的照片录入。</span><button type="button" className="secondary-button" onClick={() => navigate(`/english/words/import/${openSession.id}`)}>继续上次录入</button></div></Notice> : null}
      {error ? <div className="data-error" role="alert">{error}</div> : null}
      <Card className="vocabulary-import-card">
        <ImageDropzone disabled={busy || images.length >= 4} title="拍下单词纸，或从相册选择" onFiles={(files) => void addFiles(files)} />
        <ImageThumbnailList images={images} disabled={busy} onRemove={(id) => setImages((items) => items.filter((item) => item.attachment.id !== id))} onRotate={(id) => setImages((items) => items.map((item) => item.attachment.id === id ? { ...item, rotationDegrees: (item.rotationDegrees + 90) % 360 } : item))} />
      </Card>
      <Card className="vocabulary-import-disclosure">
        <div><Info aria-hidden="true" /><p>这些图片将发送给你配置的 AI 服务进行手写单词识别。<br />只会发送本次选中的图片；识别结果需要你确认后才会保存。</p></div>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我已了解并同意本次发送</label>
      </Card>
      <div className="word-entry-actions"><Link className="secondary-button" to="/english"><ArrowLeft size={17} />返回英语首页</Link><button className="primary-button" type="button" disabled={!images.length || !confirmed || busy} onClick={() => void start()}><Play size={17} />{busy ? "正在识别…" : "开始识别"}</button></div>
    </main>
  );
}
