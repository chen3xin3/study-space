import type { DuplicatePreview, ImportResolution } from "../../services/vocabulary-import/vocabulary-import.types";

export function DuplicateResolutionPanel({ duplicates, resolutions, onChange }: { duplicates: DuplicatePreview[]; resolutions: Record<string, ImportResolution>; onChange: (id: string, value: ImportResolution) => void }) {
  const relevant = duplicates.filter((item) => item.existingWordId || item.sameBatchCandidateIds.length);
  if (!relevant.length) return null;
  return <section className="duplicate-panel"><h2>可能重复</h2>{relevant.map((item) => <label key={item.candidateId}><span><strong>{item.word}</strong>{item.existingDeleted ? "（已删除）" : ""}</span><select aria-label={`处理重复词 ${item.word}`} value={resolutions[item.candidateId] ?? ""} onChange={(event) => onChange(item.candidateId, event.target.value as ImportResolution)}><option value="">请选择</option>{item.existingDeleted ? <option value="restore_and_append">恢复并追加释义</option> : <><option value="encounter_only">只记录再次遇到</option><option value="append_meaning">追加新释义</option></>}<option value="skip">跳过</option></select></label>)}</section>;
}
