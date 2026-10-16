import { ArrowRight, BookOpenCheck, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import type { ReviewQueueSummary } from "../../services/review-queue/review-queue.types";

interface TodayReviewCardProps {
  summary: ReviewQueueSummary | null;
  loading: boolean;
  onRetry(): void;
}

export function TodayReviewCard({ summary, loading, onRetry }: TodayReviewCardProps) {
  return (
    <section className="today-review-card" aria-labelledby="today-review-title">
      <header className="today-review-card__header">
        <div>
          <span>今日节奏</span>
          <h2 id="today-review-title">今日复习</h2>
        </div>
        {summary && summary.totalDue > 0 ? <strong>{summary.totalDue} 项待处理</strong> : null}
      </header>

      {loading && !summary ? <p className="today-review-card__state" role="status">正在整理复习内容…</p> : null}
      {summary ? (
        <div className="today-review-card__body">
          {summary.totalDue === 0 && summary.failures.length === 0 ? (
            <div className="today-review-card__complete"><BookOpenCheck aria-hidden="true" /><div><strong>今天的复习已完成</strong><span>保持现在的节奏就很好。</span></div></div>
          ) : (
            <div className="today-review-card__items" aria-label="今日复习分项">
              {summary.dueWords > 0 ? <span>单词 {summary.dueWords}</span> : null}
              {summary.dueMathWrongQuestions > 0 ? <span>数学错题 {summary.dueMathWrongQuestions}</span> : null}
              {summary.dueOtherLearningItems > 0 ? <span>其他复习 {summary.dueOtherLearningItems}</span> : null}
              {summary.pendingTasks.length > 0 ? <span>今日待办 {summary.pendingTasks.length}</span> : null}
            </div>
          )}

          <div className="today-review-card__actions">
            {summary.nextHref ? <Link to={summary.nextHref}>开始复习<ArrowRight aria-hidden="true" size={17} /></Link> : null}
            {summary.failures.length > 0 ? <div className="today-review-card__warning"><span>部分复习内容暂未载入</span><button type="button" aria-label="重试复习数据" disabled={loading} onClick={onRetry}><RefreshCw aria-hidden="true" size={15} />重试</button></div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
