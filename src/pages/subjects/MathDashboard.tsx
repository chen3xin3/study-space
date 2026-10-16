import { Archive, ArrowUpRight, FilePlus2, FileText, NotebookPen } from "lucide-react";
import { Link } from "react-router";
import "./math-workbench.css";

const mathActions = [
  {
    id: "capture",
    step: "01",
    phase: "收集",
    title: "录入错题",
    description: "记录题目、错误过程和正确解法",
    to: "/study/math/wrong-questions/new",
    icon: FilePlus2,
  },
  {
    id: "archive",
    step: "02",
    phase: "整理",
    title: "我的错题库",
    description: "筛选、重做并更新掌握状态",
    to: "/study/math/wrong-questions",
    icon: Archive,
  },
  {
    id: "notes",
    step: "03",
    phase: "理解",
    title: "笔记与例题",
    description: "围绕知识点沉淀方法",
    to: "/study/math/notes-examples",
    icon: NotebookPen,
  },
  {
    id: "exam",
    step: "04",
    phase: "检验",
    title: "模拟考试",
    description: "记录试卷、答卷与多次成绩",
    to: "/study/math/exams",
    icon: FileText,
  },
] as const;

export function MathDashboard() {
  return (
    <main
      className="page math-workbench"
      data-art-direction="math-workbench"
      data-testid="math-subject-space"
    >
      <header className="math-workbench__header">
        <div>
          <span className="math-workbench__label">解题工作台</span>
          <h1>数学</h1>
          <p>记录问题，整理方法，再用练习检验理解。</p>
        </div>
        <div className="math-workbench__path" aria-hidden="true">
          <span>收集</span><i />
          <span>整理</span><i />
          <span>理解</span><i />
          <span>检验</span>
        </div>
      </header>

      <nav className="math-workbench__grid" aria-label="数学学习功能" data-testid="math-workbench">
        {mathActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              className={`math-action math-action--${action.id}`}
              to={action.to}
              aria-label={`${action.title}：${action.description}`}
            >
              <span className="math-action__step">{action.step} · {action.phase}</span>
              <span className="math-action__icon"><Icon aria-hidden="true" /></span>
              <span className="math-action__copy">
                <strong>{action.title}</strong>
                <small>{action.description}</small>
              </span>
              <span className="math-action__arrow"><ArrowUpRight aria-hidden="true" /></span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}

export default MathDashboard;
