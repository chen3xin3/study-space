import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router";
import { createLearningItemService } from "../../services/learning-items/learning-item.service";
import { createDashboardService } from "../../services/dashboard/dashboard.service";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import type { LearningItem, LearningItemService, LearningMastery, LearningSubject } from "../../services/learning-items/learning-item.types";
import { LearningItemCard } from "./components/LearningItemCard";
import { LearningItemFilters, type StudyListMode } from "./components/LearningItemFilters";
import { getStudyCollection } from "./study-workspace.config";
import "./study-workspace.css";
import { localDateKey } from "../../utils/dashboard-calendar";

const subjectLabels: Record<LearningSubject, string> = { english: "英语", math: "数学", specialty: "专业课", politics: "政治", other: "其他" };

export function StudyWorkspacePage({ service: suppliedService, dashboardService: suppliedDashboard }: { service?: LearningItemService; dashboardService?: DashboardService } = {}) {
  const params = useParams();
  const subject = params.subject as LearningSubject;
  const collection = params.collection ?? "";
  const [service] = useState(() => suppliedService ?? createLearningItemService());
  const [dashboardService] = useState(() => suppliedDashboard ?? createDashboardService());
  const resolved = useMemo(() => {
    try { return { config: getStudyCollection(subject, collection), error: "" }; }
    catch (cause) { return { config: null, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [collection, subject]);
  const [mode, setMode] = useState<StudyListMode>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mastery, setMastery] = useState<LearningMastery | "">("");
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 200); return () => window.clearTimeout(timer); }, [search]);
  const load = useCallback(async () => {
    if (!resolved.config) { setLoading(false); return; }
    setLoading(true);
    try {
      setItems(await service.list({ subject, collection, kind: resolved.config.kind, search: debouncedSearch, mastery: mastery || undefined, favorite: mode === "favorites" ? true : undefined, trash: mode === "trash" }));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "学习内容读取失败，请重试"); }
    finally { setLoading(false); }
  }, [collection, debouncedSearch, mastery, mode, resolved.config, service, subject]);
  useEffect(() => { void load(); }, [load]);

  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  }

  async function addToToday(item: LearningItem) {
    setBusy(true); setError(""); setNotice("");
    try {
      await dashboardService.createTask({ localDate: localDateKey(new Date()), title: item.title, learningItemId: item.id });
      setNotice(`“${item.title}”已加入今日任务`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "加入今日任务失败，请重试"); }
    finally { setBusy(false); }
  }

  if (resolved.error || !resolved.config) return <main className="page study-workspace-page"><p className="study-workspace__error" role="alert">{resolved.error || "学习功能不存在"}</p><Link className="secondary-button" to={`/${subject || ""}`}><ArrowLeft size={16} />返回科目首页</Link></main>;
  const config = resolved.config;
  const emptyCopy = debouncedSearch ? "没有找到匹配的学习内容" : mode === "favorites" ? "还没有收藏内容" : mode === "trash" ? "回收站是空的" : "这里还没有学习内容";

  return <main className="page study-workspace-page" data-subject={subject}>
    <header className="study-workspace__hero"><div><Link to={`/${subject}`} className="study-workspace__back"><ArrowLeft size={16} />{subjectLabels[subject]}</Link><span className="eyebrow">{subjectLabels[subject]} · LEARNING WORKSPACE</span><h1>{config.title}</h1><p>{config.description}</p></div><Link className="primary-button" to={`/study/${subject}/${collection}/new`}><Plus size={17} />新建内容</Link></header>
    <LearningItemFilters mode={mode} search={search} mastery={mastery} supportsMastery={config.kind === "question" || config.kind === "practice"} onModeChange={setMode} onSearchChange={setSearch} onMasteryChange={setMastery} />
    {notice ? <div className="study-workspace__notice" role="status">{notice}<Link to="/">查看今日任务</Link></div> : null}
    {error ? <div className="study-workspace__error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}><RefreshCw size={15} />重试</button></div> : null}
    {loading ? <p className="study-workspace__state" aria-live="polite">正在读取学习内容…</p> : items.length ? <section className="study-workspace__items" aria-label={`${config.title}内容列表`}>{items.map((item) => <LearningItemCard key={item.id} item={item} trash={mode === "trash"} busy={busy} onAddTask={(current) => void addToToday(current)} onFavorite={(current) => void act(() => service.setFavorite(current.id, current.version, !current.favorite))} onDelete={(current) => void act(() => service.setDeleted(current.id, current.version, true))} onRestore={(current) => void act(() => service.setDeleted(current.id, current.version, false))} onDeletePermanently={(current) => { if (window.confirm("永久删除后无法恢复，确定继续吗？")) void act(() => service.deletePermanently(current.id, current.version)); }} />)}</section> : <section className="study-workspace__empty"><strong>{emptyCopy}</strong><p>{mode === "all" && !debouncedSearch ? "新建第一条真实学习记录，之后可以搜索、收藏或安排复习。" : "调整筛选条件，或返回全部内容。"}</p></section>}
  </main>;
}
