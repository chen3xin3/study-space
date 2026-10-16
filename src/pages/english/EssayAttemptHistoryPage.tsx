import { useEffect, useState } from "react";
import { ArrowLeft, FilePenLine } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createEssayService } from "../../services/essays/essay.service";
import type { AttemptDetail, EssayService } from "../../services/essays/essay.types";

export function EssayAttemptHistoryPage({ service: supplied }: { service?: EssayService }) {
  const [service] = useState(() => supplied ?? createEssayService());
  const [items, setItems] = useState<AttemptDetail[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (nextCursor: string | null, append = false) => {
    setLoading(true);
    setError("");
    try {
      const page = await service.listAttempts(nextCursor, 30);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "写作记录加载失败。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(null); }, []);

  return (
    <main className="page essay-page">
      <PageHeader eyebrow="英语 · 作文中心" title="写作记录" description="继续未完成的练习，或回看已经完成的作文。" />
      <div className="word-entry-actions"><Link className="secondary-button" to="/english/essays"><ArrowLeft size={17} />返回范文库</Link></div>
      {error ? <div className="data-error" role="alert">{error}<button type="button" onClick={() => void load(null)}>重试</button></div> : null}
      <section className="essay-list" aria-busy={loading} aria-label="写作记录列表">
        {!loading && !items.length && !error ? <Card className="library-empty"><FilePenLine size={32} /><h2>还没有写作记录</h2><p>从范文详情开始一次写作或默写练习后，会记录在这里。</p></Card> : null}
        {items.map((item) => {
          const state = item.status === "completed" ? "已完成" : "未完成";
          return (
            <Card className="essay-row" key={item.id}>
              <Link className="essay-row__main" to={`/english/essays/history/${item.id}`} aria-label={`${item.title}，${state}`}>
                <div><strong>{item.title || "未命名练习"}</strong><span>{state}</span></div>
                <p>{item.body.trim() || item.prompt?.trim() || "还没有填写正文"}</p>
              </Link>
            </Card>
          );
        })}
      </section>
      {loading ? <p className="library-loading">正在读取写作记录…</p> : null}
      {cursor && !loading ? <button className="secondary-button library-more" type="button" onClick={() => void load(cursor, true)}>加载更多</button> : null}
    </main>
  );
}
