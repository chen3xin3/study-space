import type { FocusAnalytics } from "../statistics.model";
import { formatFocusDuration } from "./StatisticsOverview";

const labels = { english: "英语", math: "数学", specialty: "专业课", politics: "政治", other: "其他" } as const;
const colors = { english: "#69c7b8", math: "#91ddd7", specialty: "#f5768d", politics: "#9b8ee0", other: "#7ba7b2" } as const;

export function SubjectDonutChart({ subjects, totalSeconds }: { subjects: FocusAnalytics["subjects"]; totalSeconds: number }) {
  let offset = 0;
  return <section className="statistics-chart statistics-subject-chart" aria-label="科目专注占比" role="region"><header><span>专注时长分布</span><strong>{formatFocusDuration(totalSeconds)}</strong></header>{subjects.length ? <div className="statistics-subject-chart__body"><svg viewBox="0 0 42 42" role="img" aria-label={`总计 ${formatFocusDuration(totalSeconds)}`}><circle className="statistics-donut__track" cx="21" cy="21" r="15.9" pathLength="100" />{subjects.map((item) => { const currentOffset = offset; offset += item.percent; return <circle key={item.subject} cx="21" cy="21" r="15.9" pathLength="100" fill="none" stroke={colors[item.subject]} strokeWidth="6" strokeDasharray={`${item.percent} ${100 - item.percent}`} strokeDashoffset={-currentOffset} />; })}</svg><ul>{subjects.map((item) => <li key={item.subject}><i style={{ background: colors[item.subject] }} /><span><strong>{labels[item.subject]}</strong><small>{formatFocusDuration(item.seconds)} · {item.sessions} 次</small></span><b>{item.percent}%</b></li>)}</ul></div> : <p className="statistics-empty">这个时间范围还没有专注记录。</p>}</section>;
}
