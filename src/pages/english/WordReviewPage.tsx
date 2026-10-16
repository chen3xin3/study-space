import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Eye, RotateCcw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createVocabularyService } from "../../services/vocabulary/vocabulary.service";
import type {
  ReviewCard,
  ReviewDirection,
  ReviewResult,
  VocabularyService,
} from "../../services/vocabulary/vocabulary.types";

interface Props { service?: VocabularyService }

function localReviewBoundaries(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const nextNine = new Date(end);
  nextNine.setHours(9, 0, 0, 0);
  return {
    localDayStart: start.toISOString(),
    localDayEnd: end.toISOString(),
    nextLocalDayNineUtc: nextNine.toISOString(),
  };
}

export function WordReviewPage({ service: suppliedService }: Props) {
  const [service] = useState(() => suppliedService ?? createVocabularyService());
  const [direction, setDirection] = useState<ReviewDirection>("en_to_zh");
  const [limit, setLimit] = useState(10);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revealedAt, setRevealedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<Record<ReviewResult, number>>({ known: 0, fuzzy: 0, unknown: 0 });
  const [completed, setCompleted] = useState(0);
  const card = cards[0] ?? null;

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const queue = await service.getReviewQueue({
        direction,
        limit,
        wordIds: [],
        now: new Date().toISOString(),
      });
      setCards(queue.map((item, index) => index === 0 ? { ...item, promptedAt: new Date().toISOString() } : item));
      setStarted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "复习队列加载失败。");
    } finally {
      setLoading(false);
    }
  };

  const reveal = useCallback(() => {
    if (card && !revealedAt) setRevealedAt(new Date().toISOString());
  }, [card, revealedAt]);

  const submit = useCallback(async (result: ReviewResult) => {
    if (!card || !revealedAt || pending) return;
    setPending(true);
    setError("");
    const submittedAt = new Date();
    try {
      await service.submitReview({
        wordId: card.wordId,
        direction: card.direction,
        result,
        reviewStateVersion: card.reviewStateVersion,
        promptedAt: card.promptedAt,
        answerRevealedAt: revealedAt,
        submittedAt: submittedAt.toISOString(),
        ...localReviewBoundaries(submittedAt),
      });
      setCounts((current) => ({ ...current, [result]: current[result] + 1 }));
      setCompleted((value) => value + 1);
      setCards((current) => {
        const next = current.slice(1);
        if (next[0]) next[0] = { ...next[0], promptedAt: new Date().toISOString() };
        return next;
      });
      setRevealedAt(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "复习结果保存失败。");
    } finally {
      setPending(false);
    }
  }, [card, pending, revealedAt, service]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!card || pending) return;
      if (event.key === " " && !revealedAt) {
        event.preventDefault();
        reveal();
      } else if (revealedAt && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        void submit(event.key === "1" ? "known" : event.key === "2" ? "fuzzy" : "unknown");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [card, pending, reveal, revealedAt, submit]);

  return (
    <main className="page vocabulary-page review-page">
      <PageHeader eyebrow="英语 · 单词系统" title="单词复习" description="先回想，再显示答案；用简单反馈安排下一次复习。" />
      {!started ? (
        <Card className="review-setup">
          <h2>开始一轮复习</h2>
          <label className="field"><span>复习方向</span><select value={direction} onChange={(event) => setDirection(event.target.value as ReviewDirection)}><option value="en_to_zh">英译中</option><option value="zh_to_en">中译英</option></select></label>
          <label className="field"><span>本轮数量</span><select value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value={10}>10 个</option><option value={20}>20 个</option><option value={500}>全部</option></select></label>
          {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
          <button className="primary-button" type="button" disabled={loading} onClick={() => void start()}>{loading ? "正在准备…" : "开始复习"}</button>
        </Card>
      ) : card ? (
        <>
          <div className="review-progress"><span>已完成 {completed}</span><span>剩余 {cards.length}</span></div>
          <Card className="review-card">
            <span className="eyebrow">{card.direction === "en_to_zh" ? "英译中" : "中译英"}</span>
            <h2>{card.prompt}</h2>
            {!revealedAt ? (
              <button aria-label="显示答案" className="primary-button reveal-button" type="button" onClick={reveal}><Eye size={18} />显示答案 <kbd>Space</kbd></button>
            ) : (
              <div className="review-answer">
                <span>答案</span><strong>{card.answer}</strong>
                <div className="review-result-actions">
                  <button type="button" disabled={pending} onClick={() => void submit("known")}>认识 <kbd>1</kbd></button>
                  <button type="button" disabled={pending} onClick={() => void submit("fuzzy")}>模糊 <kbd>2</kbd></button>
                  <button type="button" disabled={pending} onClick={() => void submit("unknown")}>不认识 <kbd>3</kbd></button>
                </div>
              </div>
            )}
            {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
          </Card>
          <div className="review-footer"><button className="secondary-button" type="button" onClick={() => { setCards((current) => [...current.slice(1), current[0]]); setRevealedAt(null); }}>跳过这个</button><button className="secondary-button" type="button" onClick={() => setCards([])}>提前结束</button></div>
        </>
      ) : (
        <Card className="review-complete">
          <RotateCcw size={34} />
          <h2>本轮复习完成</h2>
          <p>认识 {counts.known} · 模糊 {counts.fuzzy} · 不认识 {counts.unknown}</p>
          <div className="word-entry-actions"><Link className="primary-button" to="/english">返回英语首页</Link><Link className="secondary-button" to="/english/words">查看单词本</Link></div>
        </Card>
      )}
    </main>
  );
}
