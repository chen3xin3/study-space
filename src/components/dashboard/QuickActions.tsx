import { BookPlus, FilePlus2, Inbox, NotebookPen, SquarePlus } from "lucide-react";
import { Link } from "react-router";

const actions = [
  { label: "拍照导入单词", path: "/english/words/import", icon: BookPlus },
  { label: "保存错题", path: "/study/math/wrong-questions/new", icon: FilePlus2 },
  { label: "添加笔记", path: "/study/specialty/notes/new", icon: NotebookPen },
  { label: "临时资料", path: "/library/files", icon: Inbox },
] as const;

export function QuickActions({ onCreateTask }: { onCreateTask(): void }) {
  return <section className="dashboard-quick-start" aria-label="快速开始"><header><span className="eyebrow">QUICK START</span><h2>快速开始</h2><p>少一点寻找，直接进入今天要做的事。</p></header><div className="quick-actions">{actions.slice(0, 3).map(({ label, path, icon: Icon }) => <Link key={label} to={path}><Icon aria-hidden="true" size={20} /><span>{label}</span></Link>)}<button type="button" onClick={onCreateTask}><SquarePlus aria-hidden="true" size={20} /><span>创建任务</span></button>{actions.slice(3).map(({ label, path, icon: Icon }) => <Link key={label} to={path}><Icon aria-hidden="true" size={20} /><span>{label}</span></Link>)}</div></section>;
}
