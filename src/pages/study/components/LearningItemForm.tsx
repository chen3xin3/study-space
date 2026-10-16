import type { FormEvent } from "react";
import { Save } from "lucide-react";
import type { LearningItemDraft, LearningItemKind, LearningMastery, LearningSubject } from "../../../services/learning-items/learning-item.types";

export type LearningItemFormValue = Omit<LearningItemDraft, "subject" | "collection" | "kind">;

interface LearningItemFormProps {
  kind: LearningItemKind;
  subject?: LearningSubject;
  collection?: string;
  value: LearningItemFormValue;
  busy: boolean;
  onChange: (value: LearningItemFormValue) => void;
  onSubmit: () => void;
}

const masteryOptions: Array<{ value: LearningMastery; label: string }> = [
  { value: "new", label: "刚收录" },
  { value: "learning", label: "学习中" },
  { value: "familiar", label: "较熟悉" },
  { value: "mastered", label: "已掌握" },
];

export function LearningItemForm({ kind, subject, collection, value, busy, onChange, onSubmit }: LearningItemFormProps) {
  const isMathWrongQuestion = subject === "math" && collection === "wrong-questions";
  const isEnglishExam = subject === "english" && kind === "exam";
  const showAnswer = kind === "question" || kind === "practice";
  const showMastery = kind === "question" || kind === "practice";
  const showScore = kind === "exam";
  const contentLabel = isMathWrongQuestion ? "题目与错误过程" : kind === "question" || kind === "practice" ? "题目或内容" : isEnglishExam ? "试卷说明与整理备注" : kind === "exam" ? "复盘内容" : kind === "note" ? "正文" : "资料说明";
  const answerLabel = isMathWrongQuestion ? "正确解法与错因复盘" : "答案或解法";
  const tagsLabel = isMathWrongQuestion ? "知识点与题型" : "标签";
  const reviewLabel = isMathWrongQuestion ? "下次重做" : "下次复习";
  const patch = <K extends keyof LearningItemFormValue>(key: K, next: LearningItemFormValue[K]) => onChange({ ...value, [key]: next });
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };

  return <form className="learning-editor-form" onSubmit={submit}>
    <section className="learning-editor-form__main">
      <label className="learning-field learning-field--title"><span>标题</span><input autoFocus required value={value.title} onChange={(event) => patch("title", event.target.value)} placeholder="给这条学习内容一个清晰的名字" /></label>
      <label className="learning-field learning-field--body"><span>{contentLabel}</span><textarea required rows={9} value={value.content} onChange={(event) => patch("content", event.target.value)} placeholder={kind === "exam" ? "记录失分原因、时间安排和下一步改进" : isMathWrongQuestion ? "记录题目、自己的错误答案和卡住的步骤" : "把真正需要复习的内容写在这里"} /></label>
      {showAnswer ? <label className="learning-field learning-field--answer"><span>{answerLabel}</span><textarea rows={6} value={value.answer} onChange={(event) => patch("answer", event.target.value)} placeholder={isMathWrongQuestion ? "写下正确步骤，并说明出错原因和下次提醒" : "记录标准答案、关键步骤或自己的理解"} /></label> : null}
    </section>

    <aside className="learning-editor-form__side">
      <div className="learning-editor-form__note"><small>{isMathWrongQuestion ? "错题整理" : "学习记录"}</small><strong>{isMathWrongQuestion ? "把错误过程和正确方法放在同一处，方便下次重做。" : "让每一条记录都能再次找到、再次使用。"}</strong></div>
      {showScore ? <div className="learning-editor-form__score"><label className="learning-field"><span>得分</span><input aria-label="得分" type="number" min="0" value={value.score ?? ""} onChange={(event) => patch("score", event.target.value === "" ? null : Number(event.target.value))} /></label><label className="learning-field"><span>满分</span><input aria-label="满分" type="number" min="0" value={value.maxScore ?? ""} onChange={(event) => patch("maxScore", event.target.value === "" ? null : Number(event.target.value))} /></label></div> : null}
      {showMastery ? <label className="learning-field"><span>掌握状态</span><select aria-label="掌握状态" value={value.mastery} onChange={(event) => patch("mastery", event.target.value as LearningMastery)}>{masteryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
      <label className="learning-field"><span>{tagsLabel}</span><input value={value.tags.join("，")} onChange={(event) => patch("tags", event.target.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean))} placeholder="章节，题型，重点" /></label>
      <label className="learning-field"><span>来源</span><input value={value.source} onChange={(event) => patch("source", event.target.value)} placeholder="书名、页码或试卷" /></label>
      <label className="learning-field"><span>{reviewLabel}</span><input type="date" value={value.reviewAt ?? ""} onChange={(event) => patch("reviewAt", event.target.value || null)} /></label>
      <button className="primary-button learning-editor-form__submit" type="submit" disabled={busy}><Save size={17} />{busy ? "正在保存…" : "保存内容"}</button>
    </aside>
  </form>;
}
