import { useMemo, useState } from "react";
import type { DailyStudyPoint } from "../../../services/dashboard/dashboard.types";
import type { FocusHistoryItem, FocusSubject } from "../../../services/focus/focus.types";

const subjectNames: Record<FocusSubject, string> = { english: "英语", math: "数学", specialty: "专业课", politics: "政治", other: "其他" };

export interface FocusHistoryPanelProps {
  weekPoints: DailyStudyPoint[];
  history: FocusHistoryItem[];
  hasMore: boolean;
  busy: boolean;
  onLoadMore(): void | Promise<void>;
}

export function FocusHistoryPanel({ weekPoints, history, hasMore, busy, onLoadMore }: FocusHistoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const total = useMemo(() => weekPoints.reduce((sum, item) => sum + item.seconds, 0), [weekPoints]);
  const peak = useMemo(() => Math.max(3600, ...weekPoints.map((item) => item.seconds)), [weekPoints]);
  const visible = expanded ? history : history.slice(0, 8);
  return <section className="focus-history" aria-label="学习轨迹与历史">
    <div className="focus-history__summary"><div><span className="eyebrow">RHYTHM / 节奏</span><h2>最近 7 天</h2><p>累计学习 {Math.floor(total / 3600)} 小时 {Math.floor(total % 3600 / 60)} 分钟</p></div><div className="focus-week" aria-label="最近七天学习时间">{weekPoints.map((item) => <div key={item.localDate} title={`${item.localDate} 学习 ${Math.floor(item.seconds / 60)} 分钟`}><span style={{ height: `${Math.max(5, item.seconds / peak * 100)}%` }} /><small>{item.localDate.slice(5)}</small></div>)}</div></div>
    <div className="focus-history__records"><h2>最近专注</h2>{history.length ? <><ul>{visible.map((item) => <li key={item.timerId}><div><strong>{item.goal || subjectNames[item.subject] || "自由学习"}</strong><small>{new Date(item.endedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div><span>{Math.floor(item.studySeconds / 60)} 分钟</span></li>)}</ul><div className="focus-history__actions">{history.length > 8 && <button className="secondary-button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起记录" : "查看全部记录"}</button>}{expanded && hasMore && <button className="secondary-button" disabled={busy} onClick={() => void onLoadMore()}>加载更早记录</button>}</div></> : <p>完成第一次专注后，记录会出现在这里。</p>}</div>
  </section>;
}
