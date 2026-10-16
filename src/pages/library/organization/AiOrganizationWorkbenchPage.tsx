import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { MaterialSuggestionPanel, type MaterialSuggestionRow } from "../../../components/ai/MaterialSuggestionPanel";
import { toAiServiceError } from "../../../services/ai/ai.errors";
import { createAiService } from "../../../services/ai/ai.service";
import type { AiService, MaterialOrganizationSuggestion, PhotoOrganizationSuggestion } from "../../../services/ai/ai.types";
import { createLearningItemService } from "../../../services/learning-items/learning-item.service";
import type { LearningItem, LearningItemService } from "../../../services/learning-items/learning-item.types";
import { createPhotoArchiveService } from "../../../services/photo-archive/photo-archive.service";
import type { PhotoArchiveService, PhotoRecord } from "../../../services/photo-archive/photo-archive.types";
import { findStudyCollection } from "../../study/study-workspace.config";
import { OrganizationCandidateList } from "./OrganizationCandidateList";
import {
  advanceQueue, currentQueueItem, markAnalyzing, markApplied, markFailed, markReviewing,
  markSkipped, queueSummary, retryCurrent, startQueue, type OrganizationCandidate,
  type OrganizationQueueState,
} from "./organization-queue";
import "./ai-organization-workbench.css";

const AI_BLOCK_MARKER = "【AI 资料整理】";
const labels: Record<string, string> = { waiting: "等待", analyzing: "分析中", reviewing: "待确认", applied: "已应用", skipped: "已跳过", failed: "失败" };

interface AiOrganizationWorkbenchPageProps {
  learningService?: LearningItemService;
  photoService?: PhotoArchiveService;
  aiService?: AiService;
}

function organizationBlock(suggestion: MaterialOrganizationSuggestion) {
  const points = suggestion.keyPoints.map((point) => `- ${point}`).join("\n");
  return `${AI_BLOCK_MARKER}\n资料摘要\n${suggestion.summary}${points ? `\n\n关键知识点\n${points}` : ""}`;
}

function withOrganizationBlock(content: string, block: string) {
  const original = content.split(`\n\n${AI_BLOCK_MARKER}`)[0].trimEnd();
  return `${original}${original ? "\n\n" : ""}${block}`;
}

function learningInput(item: LearningItem) {
  return { subject: item.subject, collection: item.collection, kind: item.kind, title: item.title, content: item.content, answer: item.answer, source: item.source, tags: item.tags };
}

export function AiOrganizationWorkbenchPage({ learningService: suppliedLearning, photoService: suppliedPhoto, aiService: suppliedAi }: AiOrganizationWorkbenchPageProps = {}) {
  const [learningService] = useState(() => suppliedLearning ?? createLearningItemService());
  const [photoService] = useState(() => suppliedPhoto ?? createPhotoArchiveService());
  const [aiService] = useState(() => suppliedAi ?? createAiService());
  const [candidates, setCandidates] = useState<OrganizationCandidate[]>([]);
  const [selected, setSelected] = useState<OrganizationCandidate[]>([]);
  const [queue, setQueue] = useState<OrganizationQueueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [aiErrorCode, setAiErrorCode] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(true);
  const running = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      learningService.list({ trash: false }),
      photoService.list({ kind: null, trash: false, cursor: null }),
    ]).then(([learningItems, photoPage]) => {
      if (cancelled) return;
      const next: OrganizationCandidate[] = [
        ...learningItems.filter((item) => !item.deletedAt).map((item) => ({ id: `learning:${item.id}`, source: "learning" as const, title: item.title, subject: item.subject, updatedAt: item.updatedAt, record: item })),
        ...photoPage.items.filter((item) => !item.deletedAt).map((item) => ({ id: `photo:${item.attachmentId}`, source: "photo" as const, title: item.title, subject: item.kind === "english" || item.kind === "essay" ? "english" as const : null, updatedAt: item.updatedAt, record: item })),
      ];
      setCandidates(next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setLoadError("");
    }).catch((cause) => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "资料读取失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [learningService, photoService]);

  const current = queue ? currentQueueItem(queue) : null;

  useEffect(() => {
    if (!queue || !current || current.status !== "waiting" || running.current.has(current.candidate.id)) return;
    running.current.add(current.candidate.id);
    setQueue((state) => state ? markAnalyzing(state) : state);
    setAiErrorCode("");
    const request = current.candidate.source === "learning"
      ? aiService.organizeTextMaterial(learningInput(current.candidate.record as LearningItem))
      : aiService.organizePhotoMaterial({ attachmentId: (current.candidate.record as PhotoRecord).attachmentId });
    void request.then((suggestion) => {
      setSuggestionOpen(true);
      setQueue((state) => state && currentQueueItem(state)?.candidate.id === current.candidate.id ? markReviewing(state, suggestion) : state);
    }).catch((cause) => {
      const error = toAiServiceError(cause);
      setAiErrorCode(error.code);
      setQueue((state) => state && currentQueueItem(state)?.candidate.id === current.candidate.id ? markFailed(state, error.message) : state);
    }).finally(() => { running.current.delete(current.candidate.id); });
  }, [aiService, current, queue]);

  const summary = useMemo(() => queue ? queueSummary(queue) : null, [queue]);
  const done = Boolean(queue?.items.length && queue.items.every((item) => item.status === "applied" || item.status === "skipped"));

  function movePast(update: (state: OrganizationQueueState) => OrganizationQueueState) {
    setSuggestionOpen(false);
    setAiErrorCode("");
    setQueue((state) => state ? advanceQueue(update(state)) : state);
  }

  async function applySuggestion(values: Record<string, string>) {
    if (!queue || !current?.suggestion) return;
    setSaving(true); setLoadError("");
    try {
      let updated: LearningItem | PhotoRecord;
      if (current.candidate.source === "learning") {
        const record = current.candidate.record as LearningItem;
        const suggestion = current.suggestion as MaterialOrganizationSuggestion;
        const destination = values.classification === undefined ? null : findStudyCollection(suggestion.subject, suggestion.collection, suggestion.kind);
        updated = await learningService.update({
          id: record.id, version: record.version,
          subject: destination?.subject ?? record.subject, collection: destination?.collection ?? record.collection, kind: destination?.kind ?? record.kind,
          title: values.title ?? record.title,
          content: values.summary === undefined ? record.content : withOrganizationBlock(record.content, values.summary),
          answer: record.answer,
          tags: values.tags === undefined ? record.tags : values.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
          mastery: record.mastery, source: record.source, score: record.score, maxScore: record.maxScore, reviewAt: record.reviewAt,
        });
      } else {
        const record = current.candidate.record as PhotoRecord;
        updated = await photoService.update({ attachmentId: record.attachmentId, version: record.version, studyDate: record.studyDate, memorized: record.memorized, title: values.title ?? record.title, kind: (values.kind as PhotoRecord["kind"] | undefined) ?? record.kind });
      }
      setCandidates((items) => items.map((candidate) => candidate.id === current.candidate.id ? { ...candidate, title: updated.title, updatedAt: updated.updatedAt, record: updated } : candidate));
      movePast(markApplied);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "保存失败，资料未被修改");
    } finally { setSaving(false); }
  }

  const rows: MaterialSuggestionRow[] = current?.suggestion ? current.candidate.source === "learning"
    ? (() => {
      const record = current.candidate.record as LearningItem;
      const suggestion = current.suggestion as MaterialOrganizationSuggestion;
      const destination = findStudyCollection(suggestion.subject, suggestion.collection, suggestion.kind);
      return [
        { id: "title", label: "标题", currentValue: record.title, suggestedValue: suggestion.title },
        { id: "tags", label: "标签", currentValue: record.tags.join("，"), suggestedValue: suggestion.tags.join("，") },
        { id: "summary", label: "资料摘要与关键点", currentValue: "", suggestedValue: organizationBlock(suggestion), multiline: true, selectedByDefault: false },
        ...(destination && (destination.subject !== record.subject || destination.collection !== record.collection || destination.kind !== record.kind) ? [{ id: "classification", label: "资料归类", currentValue: record.collection, suggestedValue: destination.title }] : []),
      ];
    })()
    : (() => {
      const record = current.candidate.record as PhotoRecord;
      const suggestion = current.suggestion as PhotoOrganizationSuggestion;
      return [
        { id: "title", label: "照片标题", currentValue: record.title, suggestedValue: suggestion.title },
        { id: "kind", label: "资料类型", currentValue: record.kind, suggestedValue: suggestion.kind },
        { id: "photoSummary", label: "内容摘要", currentValue: "", suggestedValue: suggestion.summary, multiline: true, applyable: false },
      ];
    })() : [];

  return <main className="page ai-organization-page">
    <header className="ai-organization-hero">
      <div><Link to="/library" className="ai-organization-back"><ArrowLeft aria-hidden="true" />返回资料库</Link><span className="eyebrow">AI 资料助手</span><h1>智能整理台</h1><p>一次选择最多 10 条资料，AI 逐条给出建议；只有你确认的内容才会保存。</p></div>
      <span className="ai-organization-hero__art" aria-hidden="true"><Sparkles /></span>
    </header>

    {loadError ? <p role="alert" className="ai-organization-error"><CircleAlert aria-hidden="true" />{loadError}</p> : null}
    {!queue ? <div className="ai-organization-setup">
      {loading ? <p role="status">正在读取资料…</p> : <OrganizationCandidateList candidates={candidates} selected={selected} onSelectionChange={setSelected} />}
      <aside className="ai-organization-intro"><span>01</span><h2>先选资料，再逐条确认</h2><p>可混合选择学习记录与照片。整理过程中不会一次性覆盖原内容。</p><button type="button" className="primary-button" disabled={!selected.length || loading} onClick={() => setQueue(startQueue(selected))}><Sparkles aria-hidden="true" />开始整理</button></aside>
    </div> : <div className="ai-organization-workspace">
      <aside className="ai-organization-queue" aria-label="整理队列">
        <div><span>本轮进度</span><strong>{summary ? summary.applied + summary.skipped : 0}/{queue.items.length}</strong></div>
        <ol>{queue.items.map((item, index) => <li className={index === queue.currentIndex ? "is-current" : ""} key={item.candidate.id}><span>{index + 1}</span><div><strong>{item.candidate.title}</strong><small>{labels[item.status]}</small></div></li>)}</ol>
      </aside>
      <section className="ai-organization-current">
        {done ? <div className="ai-organization-complete"><span><Check aria-hidden="true" /></span><h2>本轮整理完成</h2><p>已应用 {summary?.applied ?? 0} 条，跳过 {summary?.skipped ?? 0} 条。</p><button type="button" className="primary-button" onClick={() => { setQueue(null); setSelected([]); }}>整理下一批</button></div>
          : current ? <><span className="eyebrow">正在处理 {queue.currentIndex + 1}/{queue.items.length}</span><h2>{current.candidate.title}</h2><p>{current.candidate.source === "learning" ? "学习资料" : "学习照片"} · AI 只分析这一条资料</p>
            {current.status === "analyzing" || current.status === "waiting" ? <div className="ai-organization-analyzing" role="status"><Sparkles aria-hidden="true" /><strong>正在生成整理建议…</strong><span>完成后会停下来等你确认</span></div> : null}
            {current.status === "reviewing" && !suggestionOpen ? <button type="button" className="primary-button" onClick={() => setSuggestionOpen(true)}>继续审核建议</button> : null}
            {current.status === "failed" ? <div className="ai-organization-failed" role="alert"><CircleAlert aria-hidden="true" /><strong>{current.error}</strong>{aiErrorCode === "AI_DISABLED" || aiErrorCode === "AI_NOT_CONFIGURED" ? <Link to="/settings#ai-assistant">前往 AI 设置</Link> : null}<div><button type="button" className="secondary-button" onClick={() => setQueue(retryCurrent(queue))}><RotateCcw aria-hidden="true" />重试这条</button><button type="button" className="secondary-button" onClick={() => movePast(markSkipped)}>跳过这条</button></div></div> : null}
          </> : null}
      </section>
    </div>}
    {current?.status === "reviewing" && suggestionOpen ? <MaterialSuggestionPanel rows={rows} busy={saving} onCancel={() => setSuggestionOpen(false)} onSkip={() => movePast(markSkipped)} onApply={(values) => void applySuggestion(values)} /> : null}
  </main>;
}
