import { useMemo, useState } from "react";
import { FileText, Image, Search } from "lucide-react";
import type { LearningSubject } from "../../../services/learning-items/learning-item.types";
import { toggleCandidate, type OrganizationCandidate, type OrganizationSource } from "./organization-queue";

interface OrganizationCandidateListProps {
  candidates: OrganizationCandidate[];
  selected: OrganizationCandidate[];
  disabled?: boolean;
  onSelectionChange(next: OrganizationCandidate[]): void;
}

const subjectOptions: Array<{ value: "all" | LearningSubject; label: string }> = [
  { value: "all", label: "全部科目" },
  { value: "english", label: "英语" },
  { value: "math", label: "数学" },
  { value: "specialty", label: "专业课" },
  { value: "politics", label: "政治" },
  { value: "other", label: "其他" },
];

function isDeleted(candidate: OrganizationCandidate) {
  return Boolean(candidate.record.deletedAt);
}

export function OrganizationCandidateList({ candidates, selected, disabled = false, onSelectionChange }: OrganizationCandidateListProps) {
  const [source, setSource] = useState<OrganizationSource>("learning");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<"all" | LearningSubject>("all");
  const selectedIds = useMemo(() => new Set(selected.map((candidate) => candidate.id)), [selected]);
  const visible = useMemo(() => candidates.filter((candidate) => {
    if (candidate.source !== source || isDeleted(candidate)) return false;
    if (search.trim() && !candidate.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
    return source !== "learning" || subject === "all" || candidate.subject === subject;
  }), [candidates, search, source, subject]);

  return <section className="organization-candidates" aria-labelledby="organization-candidates-title">
    <div className="organization-candidates__heading">
      <div><span>选择范围</span><h2 id="organization-candidates-title">待整理资料</h2></div>
      <strong>已选择 {selected.length}/10</strong>
    </div>

    <div className="organization-candidates__tabs" role="tablist" aria-label="资料来源">
      <button type="button" role="tab" aria-selected={source === "learning"} onClick={() => setSource("learning")}><FileText aria-hidden="true" />学习资料</button>
      <button type="button" role="tab" aria-selected={source === "photo"} onClick={() => setSource("photo")}><Image aria-hidden="true" />学习照片</button>
    </div>

    <div className="organization-candidates__filters">
      <label className="organization-candidates__search"><Search aria-hidden="true" /><span className="sr-only">搜索待整理资料</span><input type="search" aria-label="搜索待整理资料" placeholder="搜索标题" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {source === "learning" ? <label><span className="sr-only">筛选科目</span><select aria-label="筛选科目" value={subject} onChange={(event) => setSubject(event.target.value as "all" | LearningSubject)}>{subjectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
    </div>

    <div className="organization-candidates__list">
      {visible.length ? visible.map((candidate) => {
        const checked = selectedIds.has(candidate.id);
        return <label className={`organization-candidate${checked ? " is-selected" : ""}`} key={candidate.id}>
          <input
            type="checkbox"
            aria-label={`选择 ${candidate.title}`}
            checked={checked}
            disabled={disabled || (!checked && selected.length >= 10)}
            onChange={() => onSelectionChange(toggleCandidate(selected, candidate))}
          />
          <span className="organization-candidate__mark" aria-hidden="true" />
          <span><strong>{candidate.title}</strong><small>{candidate.source === "learning" ? "学习资料" : "学习照片"} · {candidate.updatedAt.slice(0, 10)}</small></span>
        </label>;
      }) : <p className="organization-candidates__empty">这里还没有符合条件的资料。</p>}
    </div>
  </section>;
}
