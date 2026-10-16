import { BookOpenText, Calculator, GraduationCap, Landmark } from "lucide-react";
import { Link } from "react-router";

const subjects = [
  { id: "english", name: "英语", detail: "单词 · 作文 · 复习", icon: BookOpenText },
  { id: "math", name: "数学", detail: "知识 · 错题 · 例题", icon: Calculator },
  { id: "specialty", name: "专业课", detail: "教材 · 笔记 · 题库", icon: GraduationCap },
  { id: "politics", name: "政治", detail: "背诵 · 练习 · 错题", icon: Landmark },
] as const;

export function SubjectOverview() {
  return <div className="subject-overview">{subjects.map(({ id, name, detail, icon: Icon }) => <Link key={id} to={`/${id}`} className={`subject-card subject-card--${id}`}><Icon aria-hidden="true" size={22} /><div><strong>{name}</strong><span>{detail}</span></div></Link>)}</div>;
}
