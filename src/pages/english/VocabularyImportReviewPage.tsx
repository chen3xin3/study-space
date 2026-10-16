import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { CandidateTable } from "../../components/vocabulary-import/CandidateTable";
import { DuplicateResolutionPanel } from "../../components/vocabulary-import/DuplicateResolutionPanel";
import { ImportImageViewer } from "../../components/vocabulary-import/ImportImageViewer";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createVocabularyImportService } from "../../services/vocabulary-import/vocabulary-import.service";
import type { BatchImportResult, DuplicatePreview, ImportCandidate, ImportResolution, ImportSessionDetail, VocabularyImportService } from "../../services/vocabulary-import/vocabulary-import.types";

export function VocabularyImportReviewPage({ service: supplied }: { service?: VocabularyImportService }) {
  const { sessionId = "" } = useParams();
  const [service] = useState(() => supplied ?? createVocabularyImportService());
  const [session, setSession] = useState<ImportSessionDetail | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePreview[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
  const [tags, setTags] = useState(""); const [activeImage, setActiveImage] = useState<string | null>(null);
  const [error, setError] = useState(""); const [result, setResult] = useState<BatchImportResult | null>(null);
  useEffect(() => { void service.getSession(sessionId).then((value) => { setSession(value); setActiveImage(value.images[0]?.attachmentId ?? null); if (value.status === "reviewing") void service.previewDuplicates(sessionId).then(setDuplicates); }).catch((caught) => setError(caught instanceof Error ? caught.message : "读取识别结果失败。")); }, [service, sessionId]);
  const duplicateIds = useMemo(() => new Set(duplicates.filter((item) => item.existingWordId || item.sameBatchCandidateIds.length).map((item) => item.candidateId)), [duplicates]);
  const invalid = !session || session.candidates.some((item) => {
    if (!item.selected) return false;
    const resolution = resolutions[item.id] ?? (duplicateIds.has(item.id) ? undefined : "create");
    const requiresMeaning = resolution === "create" || resolution === "append_meaning" || resolution === "restore_and_append";
    return !item.word.trim()
      || item.confidence === "uncertain"
      || !resolution
      || (requiresMeaning && !item.meaningOrNote?.trim());
  });
  const update = async (candidate: ImportCandidate) => { try { const saved = await service.updateCandidate({ id: candidate.id, version: candidate.version, word: candidate.word, meaningOrNote: candidate.meaningOrNote, confidence: candidate.confidence, selected: candidate.selected, resolution: resolutions[candidate.id] ?? candidate.resolution }); setSession((current) => current ? { ...current, candidates: current.candidates.map((item) => item.id === saved.id ? saved : item) } : current); } catch (caught) { setError(caught instanceof Error ? caught.message : "修改失败。"); } };
  const save = async () => { if (!session) return; try { setResult(await service.commit({ sessionId: session.id, version: session.version, items: session.candidates.filter((item) => item.selected).map((item) => ({ candidateId: item.id, candidateVersion: item.version, resolution: resolutions[item.id] ?? "create", tags: tags.split(/[，,]/).map((v) => v.trim()).filter(Boolean) })) })); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败。"); } };
  if (result) return <main className="page"><PageHeader eyebrow="英语 · 单词系统" title="录入完成" description="识别结果已经安全写入单词本。" /><Card className="import-result"><strong>新增 {result.created}</strong><span>追加 {result.appended}</span><span>恢复 {result.restored}</span><span>跳过 {result.skipped}</span><Link className="primary-button" to="/english/words">打开单词本</Link></Card></main>;
  return <main className="page vocabulary-review-page"><PageHeader eyebrow="英语 · 照片录入" title="核对识别结果" description="黄色项目需要你确认；修改不会自动保存到单词本。" />{error ? <div className="data-error" role="alert">{error}{session?.status === "failed" ? <button type="button" onClick={() => void service.retry(session.id, session.version).then(setSession)}>重试识别</button> : null}<Link to="/english/words/import">重新选择照片</Link></div> : null}{session ? <><div className="vocabulary-review-grid"><ImportImageViewer images={session.images} activeId={activeImage} onSelect={setActiveImage} onRotate={(image) => void service.rotateImage(session.id, image.attachmentId, session.version, (image.rotationDegrees + 90) % 360).then(setSession)} /><Card><div className="review-summary">共识别 {session.candidates.length} · 待确认 {session.candidates.filter((item) => item.confidence === "uncertain").length} · 可保存 {session.candidates.filter((item) => item.selected && item.confidence === "confident").length}</div><CandidateTable candidates={session.candidates} onChange={(item) => void update(item)} onFocusImage={setActiveImage} /><label className="field"><span>批量标签（逗号分隔）</span><input value={tags} onChange={(event) => setTags(event.target.value)} /></label><DuplicateResolutionPanel duplicates={duplicates} resolutions={resolutions} onChange={(id, value) => setResolutions((current) => ({ ...current, [id]: value }))} /><button className="primary-button" type="button" disabled={invalid} onClick={() => void save()}>确认并保存到单词本</button></Card></div></> : <p>正在读取识别结果…</p>}</main>;
}
