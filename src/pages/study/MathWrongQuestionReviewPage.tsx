import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, Eye, TimerReset } from "lucide-react";
import { Link, useParams } from "react-router";
import { createLearningItemService } from "../../services/learning-items/learning-item.service";
import type { LearningItem, LearningItemService, LearningMastery } from "../../services/learning-items/learning-item.types";
import "./study-workspace.css";

export type WrongQuestionReviewRating = "again" | "fuzzy" | "mastered";

const reviewRules: Record<WrongQuestionReviewRating, { mastery: LearningMastery; days: number; message: string }> = {
  again: { mastery: "learning", days: 1, message: "已安排明天再次复习" },
  fuzzy: { mastery: "familiar", days: 3, message: "已安排 3 天后复习" },
  mastered: { mastery: "mastered", days: 7, message: "已安排 7 天后巩固" },
};

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildWrongQuestionReviewUpdate(item: LearningItem, rating: WrongQuestionReviewRating, now: Date) {
  const rule = reviewRules[rating];
  const nextReview = new Date(now.getTime());
  nextReview.setDate(nextReview.getDate() + rule.days);
  return {
    id: item.id,
    version: item.version,
    subject: item.subject,
    collection: item.collection,
    kind: item.kind,
    title: item.title,
    content: item.content,
    answer: item.answer,
    tags: item.tags,
    mastery: rule.mastery,
    source: item.source,
    score: item.score,
    maxScore: item.maxScore,
    reviewAt: formatLocalDate(nextReview),
  };
}

interface MathWrongQuestionReviewPageProps {
  service?: LearningItemService;
  now?: Date;
}

export function MathWrongQuestionReviewPage({ service: suppliedService, now = new Date() }: MathWrongQuestionReviewPageProps = {}) {
  const { itemId = "" } = useParams();
  const [service] = useState(() => suppliedService ?? createLearningItemService());
  const [item, setItem] = useState<LearningItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    service.get(itemId).then((result) => {
      if (result.subject !== "math" || result.collection !== "wrong-questions") throw new Error("这条内容不是数学错题");
      if (active) { setItem(result); setError(""); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "错题读取失败，请重试"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [itemId, service]);

  const focusHref = useMemo(() => item ? `/focus?${new URLSearchParams({ subject: "math", goal: item.title, learningItemId: item.id })}` : "/focus", [item]);

  async function rate(rating: WrongQuestionReviewRating) {
    if (!item || !revealed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await service.update(buildWrongQuestionReviewUpdate(item, rating, now));
      setItem(updated);
      setNotice(reviewRules[rating].message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复习结果保存失败，请重试");
    } finally { setBusy(false); }
  }

  return <main className="page study-workspace-page math-review-page" data-subject="math">
    <header className="math-review__header">
      <div><Link to="/study/math/wrong-questions"><ArrowLeft size={16} />返回错题库</Link><h1>错题重做</h1><p>先独立思考，再查看解法并安排下一次复习。</p></div>
      {item ? <Link className="secondary-button" to={focusHref}><TimerReset size={16} />继续专注</Link> : null}
    </header>

    {loading ? <p className="study-workspace__state" role="status">正在读取错题…</p> : null}
    {error ? <p className="study-workspace__error" role="alert">{error}</p> : null}
    {item ? <div className="math-review__layout">
      <section className="math-review__question" aria-label="错题题目">
        <div className="math-review__meta"><span>{item.source || "数学错题"}</span>{item.tags.map((tag) => <small key={tag}>#{tag}</small>)}</div>
        <h2>{item.title}</h2>
        <p>{item.content || "这道题暂未填写题面。"}</p>
        <div className="math-review__solution">
          {revealed ? <><span>正确解法与错因</span><p>{item.answer || "暂未填写正确解法。"}</p></> : <button type="button" onClick={() => setRevealed(true)}><Eye size={17} />查看解法</button>}
        </div>
      </section>

      <aside className="math-review__rating" aria-label="本次重做结果">
        <BookOpenCheck aria-hidden="true" />
        <h2>这次掌握得怎么样？</h2>
        <p>{revealed ? "按真实情况选择，系统会安排下一次复习。" : "查看解法后再记录本次结果。"}</p>
        <div>
          <button type="button" aria-label="仍不会" disabled={!revealed || busy} onClick={() => void rate("again")}>仍不会<small>明天再练</small></button>
          <button type="button" aria-label="有点模糊" disabled={!revealed || busy} onClick={() => void rate("fuzzy")}>有点模糊<small>3 天后再练</small></button>
          <button type="button" aria-label="已掌握" disabled={!revealed || busy} onClick={() => void rate("mastered")}>已掌握<small>7 天后巩固</small></button>
        </div>
        {notice ? <p className="math-review__notice" role="status">{notice}</p> : null}
      </aside>
    </div> : null}
  </main>;
}
