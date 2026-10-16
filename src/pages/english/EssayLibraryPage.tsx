import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BookMarked, Camera, Search, Trash2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createEssayService } from "../../services/essays/essay.service";
import type {
  EssayListItem,
  EssayImportDraft,
  EssayService,
  EssaySummary,
  EssayType,
  ExamTrack,
} from "../../services/essays/essay.types";
import { EssayDashboard } from "./EssayDashboard";

export function EssayLibraryPage({ service: supplied }: { service?: EssayService }) {
  const [service] = useState(() => supplied ?? createEssayService());
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [items, setItems] = useState<EssayListItem[]>([]);
  const [summary, setSummary] = useState<EssaySummary | null>(null);
  const [drafts, setDrafts] = useState<EssayImportDraft[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextCursor: string | null, append = false) => {
    setLoading(true);
    setError("");
    try {
      const [page, nextSummary, nextDrafts] = await Promise.all([
        service.listEssays({
          search: search.trim() || null,
          category: params.get("category"),
          tag: params.get("tag"),
          examTrack: (params.get("track") as ExamTrack | null) ?? null,
          essayType: (params.get("type") as EssayType | null) ?? null,
          cursor: nextCursor,
          limit: 50,
        }),
        service.getSummary(),
        service.listImportDrafts(),
      ]);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
      setSummary(nextSummary);
      setDrafts(nextDrafts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "范文库加载失败。");
    } finally {
      setLoading(false);
    }
  }, [params, search, service]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      search.trim() ? next.set("q", search.trim()) : next.delete("q");
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
      void load(null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, params, search, setParams]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };

  const removeSelected = async () => {
    if (!selected.size || !window.confirm(`确定删除选中的 ${selected.size} 篇范文吗？`)) return;
    try {
      await service.deleteEssays([...selected]);
      setSelected(new Set());
      await load(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败。");
    }
  };

  return (
    <main className="page essay-page">
      <div className="library-header">
        <PageHeader
          eyebrow="英语 · 作文中心"
          title="我的范文库"
          description="收藏好文章、整理表达，写作和默写时随时调用。"
        />
        <div className="essay-header-actions">
          <Link className="secondary-button" to="/english/essays/history">写作记录</Link>
          <Link className="primary-button" to="/english/essays/import"><Camera size={17} />拍照导入作文</Link>
        </div>
      </div>
      <EssayDashboard summary={summary} pendingImportCount={drafts.length} />
      {drafts.length ? (
        <section className="essay-list" aria-label="待处理草稿列表">
          <div className="library-header">
            <div><h2>待处理草稿</h2><p>照片和识别结果已经保留，可以随时继续。</p></div>
          </div>
          {drafts.map((draft) => {
            const status = draft.stage === "review" ? "待核对保存" : draft.stage === "failed" ? "识别失败，可重试" : "待识别";
            const title = draft.title.trim() || `作文照片草稿`;
            return (
              <Card className="essay-row" key={draft.id}>
                <Link
                  className="essay-row__main"
                  to={`/english/essays/import/${draft.id}`}
                  aria-label={`${title}，${status}，${draft.attachmentIds.length} 张照片`}
                >
                  <div><strong>{title}</strong><span>{status}</span></div>
                  <p>{draft.attachmentIds.length} 张照片 · 点击继续处理</p>
                </Link>
              </Card>
            );
          })}
        </section>
      ) : null}
      <Card className="library-toolbar essay-toolbar">
        <div className="library-toolbar__controls" role="search" aria-label="筛选范文">
        <label className="library-search">
          <Search size={17} />
          <input aria-label="搜索范文" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索标题、正文、翻译、笔记或表达" />
        </label>
        <select aria-label="考试类型" value={params.get("track") ?? ""} onChange={(e) => updateParam("track", e.target.value)}>
          <option value="">英语一/二</option><option value="english_1">英语一</option><option value="english_2">英语二</option>
        </select>
        <select aria-label="作文类型" value={params.get("type") ?? ""} onChange={(e) => updateParam("type", e.target.value)}>
          <option value="">全部类型</option><option value="small">小作文</option><option value="large">大作文</option><option value="custom">自定义</option>
        </select>
        </div>
      </Card>
      {selected.size ? (
        <Card className="batch-bar">
          <strong>已选择 {selected.size} 篇</strong>
          <button className="secondary-button danger-button" type="button" onClick={() => void removeSelected()}><Trash2 size={16} />删除所选</button>
        </Card>
      ) : null}
      {error ? <div className="data-error" role="alert">{error}<button type="button" onClick={() => void load(null)}>重试</button></div> : null}
      <section className="essay-list" aria-busy={loading}>
        {!loading && !items.length && !error ? (
          <Card className="library-empty"><BookMarked size={32} /><h2>{drafts.length ? "还没有正式保存的范文" : "范文库还是空的"}</h2><p>{drafts.length ? "上面的照片草稿还没有完成核对，保存后会出现在这里。" : "拍下纸上的范文或作文，识别并核对后保存到这里。"}</p><Link className="primary-button" to="/english/essays/import">{drafts.length ? "继续导入新作文" : "拍照导入第一篇作文"}</Link></Card>
        ) : null}
        {items.map((item) => (
          <Card className="essay-row" key={item.id}>
            <input
              type="checkbox"
              aria-label={`选择 ${item.title}`}
              checked={selected.has(item.id)}
              onChange={() => setSelected((current) => {
                const next = new Set(current);
                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                return next;
              })}
            />
            <Link to={`/english/essays/${item.id}`} className="essay-row__main">
              <div><strong>{item.title}</strong><span>{item.examTrack === "english_1" ? "英语一" : item.examTrack === "english_2" ? "英语二" : "通用"}</span></div>
              <p>{item.excerpt || "暂无英文正文"}</p>
              <div className="essay-row__chips">
                {item.category ? <small className="chip-orange">{item.category.name}</small> : null}
                {item.tags.map((tag, index) => <small className={index % 2 ? "chip-purple" : "chip-blue"} key={tag.id}>{tag.name}</small>)}
              </div>
            </Link>
          </Card>
        ))}
      </section>
      {loading ? <p className="library-loading">正在读取范文库…</p> : null}
      {cursor && !loading ? <button className="secondary-button library-more" type="button" onClick={() => void load(cursor, true)}>加载更多</button> : null}
    </main>
  );
}
