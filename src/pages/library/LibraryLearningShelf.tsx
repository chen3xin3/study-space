import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import type { LearningItem, LearningItemKind, LearningItemService, LearningSubject } from "../../services/learning-items/learning-item.types";
import { localDateKey } from "../../utils/dashboard-calendar";
import { LearningItemCard } from "../study/components/LearningItemCard";
import type { LibrarySubjectKey, LibraryViewKey } from "./library.config";
import "../study/study-workspace.css";

const materialTypes: Array<{ value: LearningItemKind | ""; label: string }> = [
  { value: "", label: "全部类型" },
  { value: "note", label: "笔记" },
  { value: "question", label: "错题与题目" },
  { value: "material", label: "学习资料" },
  { value: "practice", label: "练习记录" },
  { value: "exam", label: "模拟考试" },
];

const viewTitles: Record<LibraryViewKey, string> = {
  recent: "最近使用",
  favorites: "收藏内容",
  trash: "回收站",
};

export interface LibraryLearningShelfProps {
  subject: LibrarySubjectKey;
  view: LibraryViewKey | null;
  service: LearningItemService;
  dashboardService: DashboardService;
}

export function LibraryLearningShelf({ subject, view, service, dashboardService }: LibraryLearningShelfProps) {
  const [kind, setKind] = useState<LearningItemKind | "">("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await service.list({
        subject: subject === "all" ? undefined : subject as LearningSubject,
        kind: kind || undefined,
        search: search || undefined,
        favorite: view === "favorites" ? true : undefined,
        trash: view === "trash",
      });
      setItems(view === "recent" ? [...results].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt)) : results);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "学习内容读取失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [kind, search, service, subject, view]);

  useEffect(() => { void load(); }, [load]);

  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError(""); setNotice("");
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

  const title = view ? viewTitles[view] : subject === "all" ? "全部学习内容" : "学习内容书架";

  return <section className="library-learning-shelf" data-subject={subject} aria-labelledby="library-learning-title">
    <div className="library-learning-shelf__heading">
      <div><span className="eyebrow">REAL CONTENT / 真实内容</span><h2 id="library-learning-title">{title}</h2></div>
      <p>搜索与筛选只展示已保存的真实学习内容。</p>
    </div>
    <div className="library-learning-filters">
      <label className="library-learning-search"><Search aria-hidden="true" size={17} /><span className="sr-only">搜索资料库学习内容</span><input type="search" aria-label="搜索资料库学习内容" value={search} placeholder="搜索标题、正文、标签或来源" onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="library-learning-type"><span>资料类型</span><select aria-label="资料类型" value={kind} onChange={(event) => setKind(event.target.value as LearningItemKind | "")}>{materialTypes.map((type) => <option key={type.value || "all"} value={type.value}>{type.label}</option>)}</select></label>
    </div>
    {notice ? <div className="library-learning-notice" role="status">{notice}</div> : null}
    {error ? <div className="library-learning-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}><RefreshCw size={15} />重试</button></div> : null}
    {loading ? <p className="library-learning-state" aria-live="polite">正在读取学习内容…</p> : items.length ? <div className="library-learning-items">{items.map((item) => <LearningItemCard key={item.id} item={item} trash={view === "trash"} busy={busy} onAddTask={(current) => void addToToday(current)} onFavorite={(current) => void act(() => service.setFavorite(current.id, current.version, !current.favorite))} onDelete={(current) => void act(() => service.setDeleted(current.id, current.version, true))} onRestore={(current) => void act(() => service.setDeleted(current.id, current.version, false))} onDeletePermanently={(current) => { if (window.confirm("永久删除后无法恢复，确定继续吗？")) void act(() => service.deletePermanently(current.id, current.version)); }} />)}</div> : <div className="library-learning-empty"><strong>没有找到符合条件的学习内容</strong><p>可以调整科目、资料类型或搜索词，或先到对应科目中新建内容。</p></div>}
  </section>;
}
