import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BookOpen, Camera, Search } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createVocabularyService } from "../../services/vocabulary/vocabulary.service";
import type {
  VocabularyService,
  WordListItem,
  WordReviewFilter,
  WordSort,
} from "../../services/vocabulary/vocabulary.types";

interface Props { service?: VocabularyService }

export function WordLibraryPage({ service: suppliedService }: Props) {
  const [service] = useState(() => suppliedService ?? createVocabularyService());
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [items, setItems] = useState<WordListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reviewStatus = (params.get("status") as WordReviewFilter | null) ?? null;
  const sort = (params.get("sort") as WordSort | null) ?? "newest";

  const load = useCallback(async (nextCursor: string | null, append = false) => {
    setLoading(true);
    setError("");
    try {
      const page = await service.listWords({
        search: search.trim() || null,
        tag: params.get("tag"),
        reviewStatus,
        createdFrom: params.get("from"),
        createdTo: params.get("to"),
        includeDeleted: false,
        sort,
        cursor: nextCursor,
        limit: 50,
        now: new Date().toISOString(),
      });
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "单词本加载失败。");
    } finally {
      setLoading(false);
    }
  }, [params, reviewStatus, search, service, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      search.trim() ? next.set("q", search.trim()) : next.delete("q");
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
      void load(null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, params, search, setParams]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runBatch = async (operation: () => Promise<{ requested: number; changed: number; skipped: number }>) => {
    setError("");
    try {
      const result = await operation();
      setMessage(`已处理 ${result.changed} 个，跳过 ${result.skipped} 个。`);
      setSelected(new Set());
      await load(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量操作失败。");
    }
  };

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };

  return (
    <main className="page vocabulary-page">
      <div className="library-header">
        <PageHeader eyebrow="英语 · 单词系统" title="我的单词本" description="搜索、筛选和整理已经录入的单词。" />
        <Link className="primary-button" to="/english/words/import"><Camera size={17} />拍照导入单词</Link>
      </div>
      <Card className="library-toolbar">
        <div className="library-toolbar__controls" role="search" aria-label="筛选单词">
        <label className="library-search">
          <Search size={17} />
          <span className="sr-only">搜索单词</span>
          <input aria-label="搜索单词" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索英文、中文、例句或备注" />
        </label>
        <select aria-label="复习状态" value={reviewStatus ?? ""} onChange={(event) => updateParam("status", event.target.value)}>
          <option value="">全部复习状态</option><option value="due">待复习</option><option value="neverReviewed">尚未复习</option><option value="scheduled">已安排</option>
        </select>
        <select aria-label="排序" value={sort} onChange={(event) => updateParam("sort", event.target.value)}>
          <option value="newest">最近录入</option><option value="alphabetical">字母顺序</option><option value="nextReview">下次复习</option>
        </select>
        </div>
      </Card>

      {selected.size ? (
        <Card className="batch-bar">
          <strong>已选择 {selected.size} 个</strong>
          <button className="secondary-button" type="button" onClick={() => {
            const tag = window.prompt("请输入要添加的标签");
            if (tag?.trim()) void runBatch(() => service.updateWordTags({ wordIds: [...selected], add: [tag.trim()], remove: [] }));
          }}>添加标签</button>
          <button className="secondary-button" type="button" onClick={() => void runBatch(() => service.scheduleWordsForToday([...selected], new Date().toISOString()))}>今天复习</button>
          <button className="secondary-button danger-button" type="button" onClick={() => {
            if (window.confirm(`确定删除选中的 ${selected.size} 个单词吗？`)) void runBatch(() => service.deleteWords([...selected]));
          }}>删除所选</button>
        </Card>
      ) : null}
      {message ? <p className="form-message form-message--success" role="status">{message}</p> : null}
      {error ? <div className="data-error" role="alert">{error}<button type="button" onClick={() => void load(null)}>重试</button></div> : null}

      <section className="word-list" aria-busy={loading}>
        {!loading && !items.length ? (
          <Card className="library-empty"><BookOpen size={30} /><h2>还没有符合条件的单词</h2><p>可以调整筛选，或拍下单词纸导入第一批内容。</p><Link className="primary-button" to="/english/words/import">拍照导入单词</Link></Card>
        ) : null}
        {items.map((item) => (
          <Card className="word-row" key={item.id}>
            <input type="checkbox" aria-label={`选择 ${item.displayText}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
            <Link className="word-row__main" to={`/english/words/${item.id}`}>
              <strong>{item.displayText}</strong><span>{item.primaryMeaning ?? "暂无释义"}</span>
            </Link>
            <div className="word-row__tags">{item.tags.map((tag) => <small key={tag.id}>{tag.name}</small>)}</div>
            <time>{item.nextReviewAt ? `复习：${new Date(item.nextReviewAt).toLocaleDateString("zh-CN")}` : "未安排"}</time>
          </Card>
        ))}
      </section>
      {loading ? <p className="library-loading">正在读取单词本…</p> : null}
      {cursor && !loading ? <button className="secondary-button library-more" type="button" onClick={() => void load(cursor, true)}>加载更多</button> : null}
    </main>
  );
}
