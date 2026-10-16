import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { Link, useParams } from "react-router";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createEssayService } from "../../services/essays/essay.service";
import type { AttemptDetail, EssayService, EssayType, ExamTrack, UpdateAttemptInput } from "../../services/essays/essay.types";

export function EssayAttemptEditorPage({ service: supplied }: { service?: EssayService }) {
  const [service] = useState(() => supplied ?? createEssayService());
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [track, setTrack] = useState<ExamTrack | "">("");
  const [type, setType] = useState<EssayType>("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { attemptId = "" } = useParams<{ attemptId: string }>();

  const apply = (loaded: AttemptDetail) => {
    setAttempt(loaded);
    setTitle(loaded.title);
    setPrompt(loaded.prompt ?? "");
    setBody(loaded.body);
    setNote(loaded.note ?? "");
    setTrack(loaded.examTrack ?? "");
    setType(loaded.essayType);
  };

  useEffect(() => {
    let active = true;
    service.getAttempt(attemptId)
      .then((loaded) => { if (active) apply(loaded); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "写作记录读取失败。"); });
    return () => { active = false; };
  }, [attemptId, service]);

  const input = (): UpdateAttemptInput | null => attempt ? {
    id: attempt.id,
    version: attempt.version,
    title: title.trim(),
    prompt: prompt.trim() || null,
    scoringCriteria: attempt.scoringCriteria,
    body,
    note: note.trim() || null,
    examTrack: track || null,
    essayType: type,
    attachmentIds: attempt.attachmentIds,
  } : null;

  const save = async () => {
    const next = input();
    if (!next) return null;
    setBusy(true);
    setError("");
    try {
      const updated = await service.updateAttempt(next);
      apply(updated);
      return updated;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "进度保存失败。");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!attempt) return;
    setBusy(true);
    setError("");
    try {
      const current = await service.updateAttempt(input()!);
      apply(await service.completeAttempt(current.id, current.version));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "完成练习失败，已填写内容仍会保留。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page essay-page">
      <PageHeader eyebrow="英语 · 写作记录" title={title || "写作练习"} description="保存进度后可以随时回来继续。" />
      {error ? <div className="data-error" role="alert">{error}</div> : null}
      {!attempt && !error ? <Card><p>正在读取写作记录…</p></Card> : attempt ? <Card className="essay-import-review">
        <div className="essay-import-review__heading"><div><span>{attempt.mode === "dictation" ? "默写练习" : "独立写作"}</span><h2>{attempt.status === "completed" ? "已完成" : "未完成"}</h2></div></div>
        <div className="essay-import-fields">
          <label className="field field-wide"><span>标题</span><input aria-label="练习标题" value={title} disabled={attempt.status === "completed"} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field field-wide"><span>题目要求（可选）</span><textarea aria-label="题目要求" value={prompt} disabled={attempt.status === "completed"} onChange={(event) => setPrompt(event.target.value)} /></label>
          <label className="field field-wide"><span>作文正文</span><textarea aria-label="作文正文" value={body} disabled={attempt.status === "completed"} onChange={(event) => setBody(event.target.value)} /></label>
          <label className="field field-wide"><span>复盘笔记（可选）</span><textarea aria-label="复盘笔记" value={note} disabled={attempt.status === "completed"} onChange={(event) => setNote(event.target.value)} /></label>
          <label className="field"><span>考试类型</span><select value={track} disabled={attempt.status === "completed"} onChange={(event) => setTrack(event.target.value as ExamTrack | "")}><option value="">通用</option><option value="english_1">英语一</option><option value="english_2">英语二</option></select></label>
          <label className="field"><span>作文类型</span><select value={type} disabled={attempt.status === "completed"} onChange={(event) => setType(event.target.value as EssayType)}><option value="custom">自定义</option><option value="small">小作文</option><option value="large">大作文</option></select></label>
        </div>
        <div className="word-entry-actions">
          <Link className="secondary-button" to="/english/essays/history"><ArrowLeft size={17} />返回写作记录</Link>
          {attempt.status === "draft" ? <>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void save()}><Save size={17} />保存进度</button>
            <button className="primary-button" type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => void complete()}><CheckCircle2 size={17} />完成练习</button>
          </> : null}
        </div>
      </Card> : null}
    </main>
  );
}
