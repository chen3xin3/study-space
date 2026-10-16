import { useEffect, useState } from "react";
import { ArrowLeft, Info, Play, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { ImageDropzone } from "../../components/vocabulary-import/ImageDropzone";
import { ImageThumbnailList, type SelectedImportImage } from "../../components/vocabulary-import/ImageThumbnailList";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createAiService } from "../../services/ai/ai.service";
import type { AiService } from "../../services/ai/ai.types";
import { createEssayService } from "../../services/essays/essay.service";
import type { EssayImportDraft, EssayService, EssayType, ExamTrack, UpdateEssayImportDraftInput } from "../../services/essays/essay.types";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  aiService?: AiService;
  essayService?: EssayService;
}

function draftImages(draft: EssayImportDraft): SelectedImportImage[] {
  return draft.attachmentIds.map((id, index) => ({
    attachment: {
      id,
      originalName: `已保存照片 ${index + 1}`,
      mediaType: "image/jpeg",
      byteSize: 0,
      sha256: "",
      createdAt: draft.createdAt,
    },
    rotationDegrees: 0,
  }));
}

function toUpdate(draft: EssayImportDraft, values: {
  stage: EssayImportDraft["stage"];
  title: string;
  body: string;
  translation: string;
  track: ExamTrack | "";
  type: EssayType;
  lastError: string | null;
}): UpdateEssayImportDraftInput {
  return {
    id: draft.id,
    version: draft.version,
    stage: values.stage,
    title: values.title.trim(),
    body: values.body.trim(),
    translation: values.translation.trim(),
    examTrack: values.track || null,
    essayType: values.type,
    lastError: values.lastError,
  };
}

export function EssayImportPage({ aiService: suppliedAi, essayService: suppliedEssay }: Props) {
  const [aiService] = useState(() => suppliedAi ?? createAiService());
  const [essayService] = useState(() => suppliedEssay ?? createEssayService());
  const [draft, setDraft] = useState<EssayImportDraft | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [translation, setTranslation] = useState("");
  const [track, setTrack] = useState<ExamTrack | "">("");
  const [type, setType] = useState<EssayType>("custom");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();

  const loadDraft = (loaded: EssayImportDraft) => {
    setDraft(loaded);
    setTitle(loaded.title);
    setBody(loaded.body);
    setTranslation(loaded.translation);
    setTrack(loaded.examTrack ?? "");
    setType(loaded.essayType);
    setError(loaded.lastError ?? "");
  };

  useEffect(() => {
    if (!draftId || draft?.id === draftId) return;
    let active = true;
    setLoading(true);
    essayService.getImportDraft(draftId)
      .then((loaded) => { if (active) loadDraft(loaded); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "草稿读取失败，请返回范文库重试。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [draft?.id, draftId, essayService]);

  const images = draft ? draftImages(draft) : [];
  const isReview = draft?.stage === "review";

  const addFiles = async (files: File[]) => {
    setError("");
    if (images.length + files.length > 4) {
      setError("一次最多选择 4 张照片。");
      return;
    }
    if (files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES)) {
      setError("只支持 10 MB 以内的 PNG、JPG 或 WebP 图片。");
      return;
    }
    setBusy(true);
    try {
      let current = draft ?? await essayService.createImportDraft();
      for (const file of files) {
        current = await essayService.addImportDraftImage(
          current.id,
          current.version,
          [...new Uint8Array(await file.arrayBuffer())],
          file.type,
        );
      }
      loadDraft(current);
      if (!draftId) navigate(`/english/essays/import/${current.id}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "照片保存失败，请重新拍摄或选择。");
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (attachmentId: string) => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      loadDraft(await essayService.removeImportDraftImage(draft.id, draft.version, attachmentId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "照片移除失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const recognize = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const settings = await aiService.getSettings();
      if (!settings.enabled || !settings.hasApiKey || !settings.apiUrl.trim() || !settings.model.trim()) {
        setError("请先完成 AI 设置，再开始识别作文照片。");
        return;
      }
      const result = await aiService.recognizeEssayImages({ attachmentIds: draft.attachmentIds });
      const updated = await essayService.updateImportDraft(toUpdate(draft, {
        stage: "review",
        title: result.title,
        body: result.body,
        translation: result.translation ?? "",
        track,
        type,
        lastError: null,
      }));
      loadDraft(updated);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "作文照片识别失败，请重试。";
      setError(message);
      try {
        loadDraft(await essayService.updateImportDraft(toUpdate(draft, {
          stage: "failed", title, body, translation, track, type, lastError: message,
        })));
      } catch {
        // The original recognition error remains visible; the persisted draft still retains its images.
      }
    } finally {
      setBusy(false);
    }
  };

  const persistReview = async () => {
    if (!draft) return null;
    const updated = await essayService.updateImportDraft(toUpdate(draft, {
      stage: "review", title, body, translation, track, type, lastError: null,
    }));
    loadDraft(updated);
    return updated;
  };

  const keepAndReturn = async () => {
    setBusy(true);
    setError("");
    try {
      if (draft && isReview) await persistReview();
      navigate("/english/essays");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "草稿保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft || !title.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const essay = await essayService.completeImportDraft(toUpdate(draft, {
        stage: "review", title, body, translation, track, type, lastError: null,
      }));
      navigate(`/english/essays/${essay.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "范文保存失败，草稿仍然保留。");
    } finally {
      setBusy(false);
    }
  };

  const abandon = async () => {
    if (!draft || !window.confirm("确定放弃这份草稿吗？已导入但未保存的照片会一并清理。")) return;
    setBusy(true);
    setError("");
    try {
      await essayService.abandonImportDraft(draft.id, draft.version);
      navigate("/english/essays");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "草稿删除失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page essay-import-page">
      <PageHeader eyebrow="英语 · 作文中心" title="拍照导入作文" description="拍下纸上的英文作文，识别后核对内容，再保存到范文库。" />
      {error ? <div className="data-error" role="alert">{error}{error.startsWith("请先完成 AI 设置") ? <> <Link to="/settings#ai-assistant">去设置</Link></> : null}</div> : null}
      {loading ? <Card><p>正在读取草稿…</p></Card> : isReview ? <Card className="essay-import-review">
        <div className="essay-import-review__heading"><div><span>识别完成</span><h2>核对后再保存</h2></div><button className="secondary-button" type="button" onClick={() => setDraft((current) => current ? { ...current, stage: "draft" } : current)}>返回照片</button></div>
        <div className="essay-import-fields">
          <label className="field field-wide"><span>标题</span><input aria-label="标题" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field field-wide"><span>英文正文</span><textarea aria-label="英文正文" value={body} onChange={(event) => setBody(event.target.value)} /></label>
          <label className="field field-wide"><span>中文翻译（可选）</span><textarea aria-label="中文翻译" value={translation} onChange={(event) => setTranslation(event.target.value)} /></label>
          <label className="field"><span>考试类型</span><select value={track} onChange={(event) => setTrack(event.target.value as ExamTrack | "")}><option value="">通用</option><option value="english_1">英语一</option><option value="english_2">英语二</option></select></label>
          <label className="field"><span>作文类型</span><select value={type} onChange={(event) => setType(event.target.value as EssayType)}><option value="custom">自定义</option><option value="small">小作文</option><option value="large">大作文</option></select></label>
        </div>
        <div className="word-entry-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void keepAndReturn()}><ArrowLeft size={17} />保留草稿并返回</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void abandon()}><Trash2 size={17} />放弃草稿</button>
          <button className="primary-button" type="button" disabled={!title.trim() || !body.trim() || busy} onClick={() => void save()}><Save size={17} />{busy ? "正在保存…" : "保存到范文库"}</button>
        </div>
      </Card> : <>
        <Card className="essay-import-card">
          <ImageDropzone disabled={busy || images.length >= 4} title="拍下作文，或从相册选择" desktopTitle="拖入作文照片，或从电脑选择" description="字迹尽量清楚、光线均匀；支持最多 4 张照片，选择后立即保存为草稿。" onFiles={(files) => void addFiles(files)} />
          <ImageThumbnailList images={images} disabled={busy} allowRotation={false} onRemove={(id) => void removeImage(id)} onRotate={() => undefined} />
        </Card>
        <Card className="vocabulary-import-disclosure">
          <div><Info aria-hidden="true" /><p>这些图片将发送给你配置的 AI 服务进行文字识别。识别结果需要你确认后才会保存。</p></div>
          <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我已了解并同意本次发送</label>
        </Card>
        <div className="word-entry-actions">
          <Link className="secondary-button" to="/english/essays"><ArrowLeft size={17} />{draft ? "保留草稿并返回" : "返回范文库"}</Link>
          {draft ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void abandon()}><Trash2 size={17} />放弃草稿</button> : null}
          <button className="primary-button" type="button" disabled={!images.length || !confirmed || busy} onClick={() => void recognize()}><Play size={17} />{busy ? "正在识别…" : "开始识别"}</button>
        </div>
      </>}
    </main>
  );
}
