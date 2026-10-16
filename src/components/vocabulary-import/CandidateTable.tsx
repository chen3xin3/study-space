import type { ImportCandidate } from "../../services/vocabulary-import/vocabulary-import.types";

export function CandidateTable({ candidates, onChange, onFocusImage }: { candidates: ImportCandidate[]; onChange: (candidate: ImportCandidate) => void; onFocusImage: (id: string | null) => void }) {
  return <div className="candidate-table" role="table" aria-label="识别结果">
    {candidates.map((candidate) => <div role="row" key={candidate.id} className={`candidate-row candidate-row--${candidate.confidence}`} onClick={() => onFocusImage(candidate.sourceAttachmentId)}>
      <label><input type="checkbox" aria-label={`保存 ${candidate.word}`} checked={candidate.selected} onChange={(event) => onChange({ ...candidate, selected: event.target.checked })} /></label>
      <label><span>单词</span><input aria-label={`单词 ${candidate.word}`} value={candidate.word} onChange={(event) => onChange({ ...candidate, word: event.target.value })} /></label>
      <label><span>释义或注释</span><input aria-label={`释义 ${candidate.word}`} value={candidate.meaningOrNote ?? ""} onChange={(event) => onChange({ ...candidate, meaningOrNote: event.target.value })} /></label>
      <button type="button" className="confidence-button" onClick={() => onChange({ ...candidate, confidence: candidate.confidence === "uncertain" ? "confident" : "uncertain" })}>{candidate.confidence === "uncertain" ? "待确认" : "已确认"}</button>
    </div>)}
  </div>;
}
