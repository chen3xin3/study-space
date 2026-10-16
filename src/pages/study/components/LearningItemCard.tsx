import { ArchiveRestore, ArrowRight, CalendarClock, Heart, ListPlus, RefreshCw, RotateCcw, Timer, Trash2 } from "lucide-react";
import { Link } from "react-router";
import type { LearningItem } from "../../../services/learning-items/learning-item.types";

const masteryLabels = { new: "新内容", learning: "学习中", familiar: "较熟悉", mastered: "已掌握" };

export interface LearningItemCardProps {
  item: LearningItem;
  trash: boolean;
  busy: boolean;
  onFavorite(item: LearningItem): void;
  onDelete(item: LearningItem): void;
  onRestore(item: LearningItem): void;
  onDeletePermanently(item: LearningItem): void;
  onAddTask(item: LearningItem): void;
}

export function LearningItemCard({ item, trash, busy, onFavorite, onDelete, onRestore, onDeletePermanently, onAddTask }: LearningItemCardProps) {
  return <article className={`learning-item-card is-${item.kind}`}>
    <div className="learning-item-card__meta"><span>{item.source || masteryLabels[item.mastery]}</span>{item.reviewAt ? <small><CalendarClock size={13} />{item.reviewAt}</small> : null}</div>
    <h2>{item.title}</h2>
    <p>{item.content || item.answer || "暂未填写正文"}</p>
    {item.tags.length ? <div className="learning-item-card__tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
    <footer>
      {trash ? <>
        <button type="button" disabled={busy} aria-label={`恢复 ${item.title}`} onClick={() => onRestore(item)}><ArchiveRestore size={16} />恢复</button>
        <button type="button" disabled={busy} aria-label={`永久删除 ${item.title}`} className="is-danger" onClick={() => onDeletePermanently(item)}><Trash2 size={16} />永久删除</button>
      </> : <>
        <button type="button" disabled={busy} aria-label={`加入今日任务 ${item.title}`} onClick={() => onAddTask(item)}><ListPlus size={16} />今日任务</button>
        {item.subject === "math" && item.collection === "wrong-questions" ? <Link className="learning-item-card__redo" to={`/study/math/wrong-questions/${item.id}/review`} aria-label={`重做 ${item.title}`}><RefreshCw size={16} />重做</Link> : null}
        <Link className="learning-item-card__focus" to={`/focus?${new URLSearchParams({ subject: item.subject, goal: item.title, learningItemId: item.id })}`} aria-label={`开始专注 ${item.title}`}><Timer size={16} />专注</Link>
        <button type="button" disabled={busy} aria-label={`${item.favorite ? "取消收藏" : "收藏"} ${item.title}`} className={item.favorite ? "is-favorite" : ""} onClick={() => onFavorite(item)}><Heart size={16} fill={item.favorite ? "currentColor" : "none"} />{item.favorite ? "已收藏" : "收藏"}</button>
        <button type="button" disabled={busy} aria-label={`移入回收站 ${item.title}`} onClick={() => onDelete(item)}><RotateCcw size={16} />移入回收站</button>
        <Link to={`/study/${item.subject}/${item.collection}/${item.id}`} aria-label={`查看 ${item.title}`}>打开<ArrowRight size={16} /></Link>
      </>}
    </footer>
  </article>;
}
