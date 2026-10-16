import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { LearningJourney } from "../../components/learning-tools/LearningJourney";
import { createDashboardService } from "../../services/dashboard/dashboard.service";
import type { DashboardService } from "../../services/dashboard/dashboard.types";
import { createLearningItemService } from "../../services/learning-items/learning-item.service";
import type { LearningItemService } from "../../services/learning-items/learning-item.types";
import { LibraryLearningShelf } from "./LibraryLearningShelf";
import {
  englishCollections,
  libraryCollections,
  libraryPublicViews,
  librarySubjects,
  type LibrarySubjectKey,
  type LibraryViewKey,
} from "./library.config";
import "./library-shelf.css";

const subjectKeys = new Set(librarySubjects.map(({ key }) => key));
const viewKeys = new Set(libraryPublicViews.map(({ key }) => key));

export interface LibraryPageProps {
  learningService?: LearningItemService;
  dashboardService?: DashboardService;
}

export function LibraryPage({ learningService: suppliedLearning, dashboardService: suppliedDashboard }: LibraryPageProps = {}) {
  const [searchParams] = useSearchParams();
  const [learningService] = useState(() => suppliedLearning ?? createLearningItemService());
  const [dashboardService] = useState(() => suppliedDashboard ?? createDashboardService());
  const subjectParam = searchParams.get("subject") ?? "all";
  const activeSubject = (subjectKeys.has(subjectParam as LibrarySubjectKey) ? subjectParam : "all") as LibrarySubjectKey;
  const viewParam = searchParams.get("view");
  const activeView = viewParam && viewKeys.has(viewParam as LibraryViewKey) ? viewParam as LibraryViewKey : null;
  const current = librarySubjects.find(({ key }) => key === activeSubject) ?? librarySubjects[0];

  return (
    <main className="page resource-library-page">
      <LearningJourney current="library" />
      <header className="resource-library-hero">
        <div>
          <span className="eyebrow">统一资料空间 / LIBRARY</span>
          <h1>资料库</h1>
          <p>先按科目找到资料，再按照片、文档和笔记继续整理。</p>
        </div>
        <div className="resource-library-hero__actions">
          <Link className="resource-library-organize" to="/library/organize" aria-label="打开智能整理台"><Sparkles size={19} aria-hidden="true" /><span><strong>智能整理台</strong><small>逐条审核 AI 建议</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
          <span className="resource-library-hero__mark" aria-hidden="true"><Sparkles size={28} /></span>
        </div>
      </header>

      <nav className="resource-library-subjects" aria-label="资料科目">
        {librarySubjects.map(({ key, label, description, search, tone, icon: Icon }) => (
          <Link
            className={`resource-subject resource-subject--${tone}${activeSubject === key && !activeView ? " is-active" : ""}`}
            key={key}
            to={`/library${search}`}
            aria-label={label}
            aria-current={activeSubject === key && !activeView ? "page" : undefined}
          >
            <span><Icon size={19} aria-hidden="true" /></span>
            <strong>{label}</strong>
            <small>{description}</small>
          </Link>
        ))}
      </nav>

      <section className="resource-library-section" aria-labelledby="library-collections-title">
        <div className="resource-library-section__heading">
          <div><span className="eyebrow">SUBJECT SHELF / 资料类型</span><h2 id="library-collections-title">{activeSubject === "all" ? "全部资料" : `${current.label}书架`}</h2></div>
          <div className="resource-library-section__actions"><p>{activeSubject === "all" ? "选择一种资料类型继续整理" : "当前只展示已有真实资料，不生成虚假数量"}</p>{activeSubject !== "all" && <Link className="secondary-button" to={`/focus?subject=${activeSubject}`}>开始{current.label}专注 <ArrowRight size={16} /></Link>}</div>
        </div>
        <div className="resource-library-collections">
          {libraryCollections.map(({ key, label, description, to, tone, icon: Icon }) => (
            <Link className={`resource-collection resource-collection--${tone}`} key={key} to={to} aria-label={label}>
              <span><Icon size={24} aria-hidden="true" /></span>
              <div><strong>{label}</strong><p>{description}</p></div>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
          {activeSubject === "english" && englishCollections.map(({ key, label, description, to, icon: Icon }) => (
            <Link className="resource-collection resource-collection--blue" key={key} to={to} aria-label={label}>
              <span><Icon size={24} aria-hidden="true" /></span>
              <div><strong>{label}</strong><p>{description}</p></div>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <LibraryLearningShelf subject={activeSubject} view={activeView} service={learningService} dashboardService={dashboardService} />

      <nav className="resource-library-public" aria-label="资料公共视图">
        {libraryPublicViews.map(({ key, label, description, icon: Icon }) => (
          <Link className={activeView === key ? "is-active" : ""} key={key} to={`/library?view=${key}`} aria-label={label}>
            <Icon size={18} aria-hidden="true" />
            <span><strong>{label}</strong><small>{description}</small></span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
