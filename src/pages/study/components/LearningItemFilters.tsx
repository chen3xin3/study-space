import { Search } from "lucide-react";
import type { LearningMastery } from "../../../services/learning-items/learning-item.types";

export type StudyListMode = "all" | "favorites" | "trash";

export interface LearningItemFiltersProps {
  mode: StudyListMode;
  search: string;
  mastery: LearningMastery | "";
  supportsMastery: boolean;
  onModeChange(mode: StudyListMode): void;
  onSearchChange(search: string): void;
  onMasteryChange(mastery: LearningMastery | ""): void;
}

export function LearningItemFilters({ mode, search, mastery, supportsMastery, onModeChange, onSearchChange, onMasteryChange }: LearningItemFiltersProps) {
  const tabs: Array<{ value: StudyListMode; label: string }> = [
    { value: "all", label: "全部" },
    { value: "favorites", label: "收藏" },
    { value: "trash", label: "回收站" },
  ];
  return <div className="study-filters">
    <div className="study-filters__tabs" role="tablist" aria-label="内容范围">
      {tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={mode === tab.value} className={mode === tab.value ? "is-active" : ""} onClick={() => onModeChange(tab.value)}>{tab.label}</button>)}
    </div>
    <label className="study-search"><Search aria-hidden="true" size={17} /><span className="sr-only">搜索学习内容</span><input type="search" aria-label="搜索学习内容" value={search} placeholder="搜索标题、正文、标签或来源" onChange={(event) => onSearchChange(event.target.value)} /></label>
    {supportsMastery && mode !== "trash" ? <label className="study-mastery"><span>掌握状态</span><select value={mastery} onChange={(event) => onMasteryChange(event.target.value as LearningMastery | "")}><option value="">全部状态</option><option value="new">新内容</option><option value="learning">学习中</option><option value="familiar">较熟悉</option><option value="mastered">已掌握</option></select></label> : null}
  </div>;
}
