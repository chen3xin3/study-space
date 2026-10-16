import { useState } from "react";
import type { FocusHistoryItem, FocusSubject } from "../../../services/focus/focus.types";
import { formatFocusDuration } from "./StatisticsOverview";

const labels: Record<FocusSubject, string> = { english: "英语", math: "数学", specialty: "专业课", politics: "政治", other: "其他" };

export function FocusRecords({ records }: { records: FocusHistoryItem[] }) {
  const [expanded, setExpanded] = useState(false); const visible = expanded ? records : records.slice(0, 8);
  return <section className="statistics-records" aria-label="专注记录" role="region"><header><div><span>专注记录</span><small>{records.length} 次</small></div>{records.length > 8 && <button onClick={() => setExpanded((value) => !value)}>{expanded ? "收起记录" : "查看全部记录"}</button>}</header>{visible.length ? <ul>{visible.map((item) => <li key={item.timerId}><span className={`statistics-records__subject is-${item.subject}`}>{labels[item.subject]}</span><div><strong>{item.goal || `${labels[item.subject]}学习`}</strong><small>{new Date(item.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div><b>{formatFocusDuration(item.studySeconds)}</b></li>)}</ul> : <p className="statistics-empty">完成第一次专注后，记录会出现在这里。</p>}</section>;
}
