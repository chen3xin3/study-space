import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { MaterialSuggestionPanel, type MaterialSuggestionRow } from "../../components/ai/MaterialSuggestionPanel";
import { createAiService } from "../../services/ai/ai.service";
import { toAiServiceError } from "../../services/ai/ai.errors";
import type { AiService, MaterialOrganizationSuggestion } from "../../services/ai/ai.types";
import { createLearningItemService } from "../../services/learning-items/learning-item.service";
import type { LearningItem, LearningItemService, LearningSubject } from "../../services/learning-items/learning-item.types";
import { LearningItemForm, type LearningItemFormValue } from "./components/LearningItemForm";
import { findStudyCollection, getStudyCollection, type StudyWorkspaceConfig } from "./study-workspace.config";
import "./study-workspace.css";

const blankValue = (): LearningItemFormValue => ({ title: "", content: "", answer: "", tags: [], mastery: "new", source: "", score: null, maxScore: null, reviewAt: null });

function itemName(config: StudyWorkspaceConfig) {
  if (config.collection === "wrong-questions") return "错题";
  if (config.subject === "english" && config.kind === "exam") return "试卷记录";
  if (config.kind === "exam") return "模拟考试";
  if (config.collection === "notes") return "专业课笔记";
  if (config.kind === "question") return "题目";
  if (config.kind === "note") return config.title;
  if (config.kind === "material") return "学习资料";
  return config.title;
}

function valueFromItem(item: LearningItem): LearningItemFormValue {
  return { title: item.title, content: item.content, answer: item.answer, tags: item.tags, mastery: item.mastery, source: item.source, score: item.score, maxScore: item.maxScore, reviewAt: item.reviewAt };
}

const AI_BLOCK_MARKER = "【AI 资料整理】";

function organizationBlock(suggestion: MaterialOrganizationSuggestion) {
  const points = suggestion.keyPoints.map((point) => `- ${point}`).join("\n");
  return `${AI_BLOCK_MARKER}\n资料摘要\n${suggestion.summary}${points ? `\n\n关键知识点\n${points}` : ""}`;
}

function withOrganizationBlock(content: string, block: string) {
  const original = content.split(`\n\n${AI_BLOCK_MARKER}`)[0].trimEnd();
  return `${original}${original ? "\n\n" : ""}${block}`;
}

interface StudyItemEditorPageProps { service?: LearningItemService; aiService?: AiService }

export function StudyItemEditorPage({ service: suppliedService, aiService: suppliedAiService }: StudyItemEditorPageProps = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const subject = params.subject as LearningSubject;
  const collection = params.collection ?? "";
  const itemId = params.itemId;
  const [service] = useState(() => suppliedService ?? createLearningItemService());
  const [aiService] = useState(() => suppliedAiService ?? createAiService());
  const resolved = useMemo(() => {
    try { return { config: getStudyCollection(subject, collection), error: "" }; }
    catch (cause) { return { config: null, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [collection, subject]);
  const [value, setValue] = useState<LearningItemFormValue>(blankValue);
  const [item, setItem] = useState<LearningItem | null>(null);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [error, setError] = useState("");
  const [aiErrorCode, setAiErrorCode] = useState("");
  const [suggestion, setSuggestion] = useState<MaterialOrganizationSuggestion | null>(null);
  const [targetConfig, setTargetConfig] = useState<StudyWorkspaceConfig | null>(null);

  useEffect(() => {
    if (!itemId) { setValue(blankValue()); setItem(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void service.get(itemId).then(async (found) => {
      const opened = await service.touchOpened(found.id, found.version);
      if (!cancelled) { setItem(opened); setValue(valueFromItem(opened)); setError(""); }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "学习内容读取失败"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId, service]);

  useEffect(() => { setTargetConfig(null); setSuggestion(null); }, [subject, collection]);

  async function organize() {
    if (!resolved.config || !value.content.trim() || organizing) return;
    setOrganizing(true); setError(""); setAiErrorCode("");
    try {
      setSuggestion(await aiService.organizeTextMaterial({
        subject, collection, kind: resolved.config.kind, title: value.title, content: value.content,
        answer: value.answer, source: value.source, tags: value.tags,
      }));
    } catch (cause) {
      const aiError = toAiServiceError(cause);
      setError(aiError.message); setAiErrorCode(aiError.code);
    } finally { setOrganizing(false); }
  }

  function applySuggestion(values: Record<string, string>) {
    if (!suggestion) return;
    setValue((current) => ({
      ...current,
      title: values.title ?? current.title,
      tags: values.tags === undefined ? current.tags : values.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      content: values.summary === undefined ? current.content : withOrganizationBlock(current.content, values.summary),
    }));
    if (values.classification !== undefined) {
      setTargetConfig(findStudyCollection(suggestion.subject, suggestion.collection, suggestion.kind));
    }
    setSuggestion(null);
  }

  async function save() {
    if (!resolved.config) return;
    setBusy(true); setError("");
    const destination = targetConfig ?? resolved.config;
    const draft = { ...value, subject: destination.subject, collection: destination.collection, kind: destination.kind };
    try {
      if (item) await service.update({ ...draft, id: item.id, version: item.version });
      else await service.create(draft);
      navigate(`/study/${destination.subject}/${destination.collection}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请检查内容后重试"); }
    finally { setBusy(false); }
  }

  if (resolved.error || !resolved.config) return <main className="page study-workspace-page"><p role="alert" className="study-workspace__error">{resolved.error || "学习功能不存在"}</p></main>;
  const config = resolved.config;
  const suggestedDestination = suggestion ? findStudyCollection(suggestion.subject, suggestion.collection, suggestion.kind) : null;
  const suggestionRows: MaterialSuggestionRow[] = suggestion ? [
    { id: "title", label: "标题", currentValue: value.title, suggestedValue: suggestion.title },
    { id: "tags", label: "标签", currentValue: value.tags.join("，"), suggestedValue: suggestion.tags.join("，") },
    { id: "summary", label: "资料摘要与关键点", currentValue: "", suggestedValue: organizationBlock(suggestion), multiline: true, selectedByDefault: false },
    ...(suggestedDestination && (suggestedDestination.subject !== subject || suggestedDestination.collection !== collection || suggestedDestination.kind !== config.kind)
      ? [{ id: "classification", label: "资料归类", currentValue: config.title, suggestedValue: suggestedDestination.title }]
      : []),
  ] : [];
  return <main className="page study-workspace-page learning-editor-page" data-subject={subject}>
    <header className="learning-editor__header"><div><Link className="study-workspace__back" to={`/study/${subject}/${collection}`}><ArrowLeft size={16} />返回{config.title}</Link><span className="eyebrow">{itemId ? "EDIT" : "CREATE"} · {config.kind.toUpperCase()}</span><h1>{itemId ? "编辑" : "新建"}{itemName(config)}</h1><p>{itemId ? "更新这条内容，让下次复习更直接。" : config.description}</p></div>
      {value.content.trim() ? <button type="button" className="secondary-button learning-editor__ai-action" disabled={organizing || busy} onClick={() => void organize()}><Sparkles size={17} />{organizing ? "正在整理…" : "AI 整理"}</button> : null}</header>
    {error ? <p role="alert" className="study-workspace__error"><span>{error}</span>{aiErrorCode === "AI_DISABLED" || aiErrorCode === "AI_NOT_CONFIGURED" ? <Link to="/settings#ai-assistant">前往 AI 设置</Link> : null}</p> : null}
    {loading ? <p className="study-workspace__state">正在打开学习内容…</p> : <LearningItemForm kind={config.kind} subject={subject} collection={collection} value={value} busy={busy} onChange={setValue} onSubmit={() => void save()} />}
    {suggestion ? <MaterialSuggestionPanel rows={suggestionRows} busy={busy} onCancel={() => setSuggestion(null)} onApply={applySuggestion} /> : null}
  </main>;
}
