import { FormEvent, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createEssayService } from "../../services/essays/essay.service";
import { createPhotoArchiveService } from "../../services/photo-archive/photo-archive.service";
import type { PhotoArchiveService } from "../../services/photo-archive/photo-archive.types";
import type {
  EssayDetail,
  EssayService,
  EssayType,
  ExamTrack,
  ExpressionInput,
} from "../../services/essays/essay.types";

function EssaySourcePhotos({ ids, service }: { ids: string[]; service: PhotoArchiveService }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    let created: string[] = [];
    void Promise.all(ids.map((id) => service.read(id).then((image) =>
      URL.createObjectURL(new Blob([new Uint8Array(image.bytes).buffer as ArrayBuffer], { type: image.mediaType }))
    ).catch(() => ""))).then((results) => {
      created = results.filter(Boolean);
      if (active) setUrls(results); else created.forEach((url) => URL.revokeObjectURL(url));
    });
    return () => { active = false; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [ids.join("|"), service]);
  return <Card className="essay-source-photos"><h2>原稿照片</h2><p>这是保存范文时使用的原始照片，可对照核查。</p>
    <div>{ids.map((id, index) => urls[index]
      ? <a key={id} href={urls[index]} target="_blank" rel="noreferrer"><img src={urls[index]} alt={`作文原稿 ${index + 1}`} /></a>
      : <span key={id}>原稿 {index + 1} 暂不可查看</span>)}</div>
  </Card>;
}

export function EssayEditorPage({ service: supplied, photoService: suppliedPhotos }: { service?: EssayService; photoService?: PhotoArchiveService }) {
  const [service] = useState(() => supplied ?? createEssayService());
  const [photoService] = useState(() => suppliedPhotos ?? createPhotoArchiveService());
  const { essayId } = useParams();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<EssayDetail | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [translation, setTranslation] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [expressions, setExpressions] = useState("");
  const [track, setTrack] = useState<ExamTrack | "">("");
  const [type, setType] = useState<EssayType>("custom");
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fill = (detail: EssayDetail) => {
    setSaved(detail);
    setTitle(detail.title);
    setBody(detail.body);
    setTranslation(detail.translation ?? "");
    setNote(detail.note ?? "");
    setSource(detail.source ?? "");
    setCategory(detail.category?.name ?? "");
    setTags(detail.tags.map((tag) => tag.name).join("，"));
    setExpressions(detail.expressions.map((item) => item.explanation ? `${item.expression}｜${item.explanation}` : item.expression).join("\n"));
    setTrack(detail.examTrack ?? "");
    setType(detail.essayType);
  };

  const reload = async () => {
    if (!essayId) return;
    setError("");
    try { fill(await service.getEssay(essayId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "范文读取失败。"); }
  };

  useEffect(() => { void reload(); }, [essayId, service]);

  const expressionInputs = (): ExpressionInput[] => expressions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [expression, explanation] = line.split("｜", 2);
      return { expression: expression.trim(), explanation: explanation?.trim() || null };
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const common = {
      title,
      body,
      translation: translation.trim() || null,
      examTrack: track || null,
      essayType: type,
      source: source.trim() || null,
      note: note.trim() || null,
      category: category.trim() || null,
      expressions: expressionInputs(),
      tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    };
    try {
      if (!saved) throw new Error("没有找到可编辑的范文。");
      await service.updateEssay({ id: saved.id, version: saved.version, ...common });
      navigate("/english/essays");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page essay-page">
      <PageHeader eyebrow="英语 · 范文库" title="编辑范文" description="修正照片识别内容，翻译、表达和分类可以按需补充。" />
      <Card className="essay-editor-card">
        <form onSubmit={(event) => void submit(event)}>
          <label className="field"><span>标题</span><input aria-label="标题" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="例如：建议信模板" /></label>
          <label className="field"><span>英文原文</span><textarea aria-label="英文原文" value={body} onChange={(e) => setBody(e.target.value)} required placeholder="在这里粘贴或输入英文范文…" /></label>
          <button className="word-entry-more" type="button" onClick={() => setMore((value) => !value)}>
            {more ? <ChevronUp size={17} /> : <ChevronDown size={17} />}{more ? "收起补充内容" : "补充翻译、分类、表达和笔记"}
          </button>
          {more ? (
            <div className="essay-editor-more">
              <label className="field field-wide"><span>中文翻译</span><textarea value={translation} onChange={(e) => setTranslation(e.target.value)} /></label>
              <label className="field"><span>考试类型</span><select value={track} onChange={(e) => setTrack(e.target.value as ExamTrack | "")}><option value="">通用</option><option value="english_1">英语一</option><option value="english_2">英语二</option></select></label>
              <label className="field"><span>作文类型</span><select value={type} onChange={(e) => setType(e.target.value as EssayType)}><option value="small">小作文</option><option value="large">大作文</option><option value="custom">自定义</option></select></label>
              <label className="field"><span>分类</span><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例如：书信" /></label>
              <label className="field"><span>标签</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="用逗号分隔" /></label>
              <label className="field field-wide"><span>重点表达</span><textarea value={expressions} onChange={(e) => setExpressions(e.target.value)} placeholder={"每行一个；可写成：表达｜解释"} /></label>
              <label className="field"><span>来源</span><input value={source} onChange={(e) => setSource(e.target.value)} /></label>
              <label className="field"><span>笔记</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
          ) : null}
          {error ? <div className="form-message form-message--error" role="alert">{error}{saved ? <button type="button" onClick={() => void reload()}>重新读取</button> : null}</div> : null}
          <div className="word-entry-actions">
            <button className="primary-button" type="submit" disabled={saving}><Save size={17} />{saving ? "正在保存…" : "保存范文"}</button>
            <button className="secondary-button" type="button" onClick={() => navigate("/english/essays")}>取消</button>
          </div>
        </form>
      </Card>
      {saved?.sourcePhotoIds?.length ? <EssaySourcePhotos ids={saved.sourcePhotoIds} service={photoService} /> : null}
    </main>
  );
}
