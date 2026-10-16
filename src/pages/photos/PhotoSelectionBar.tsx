import { RotateCcw, Trash2, X } from "lucide-react";
import type { PhotoKind } from "../../services/photo-archive/photo-archive.types";

interface PhotoSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  trash: boolean;
  busy: boolean;
  category: PhotoKind;
  onSelectAll: () => void;
  onClear: () => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
  onCategoryChange: (value: PhotoKind) => void;
  onApplyCategory: () => void;
}

export function PhotoSelectionBar({ selectedCount, totalCount, trash, busy, category, onSelectAll, onClear, onMoveToTrash, onRestore, onDeletePermanently, onCategoryChange, onApplyCategory }: PhotoSelectionBarProps) {
  return <section className="photo-selection-bar" aria-label="批量操作">
    <strong>已选 {selectedCount} 张</strong>
    <button type="button" className="secondary-button" disabled={busy || totalCount === 0} onClick={onSelectAll}>全选当前照片</button>
    {trash ? <><button type="button" className="secondary-button" disabled={busy || selectedCount === 0} onClick={onRestore}><RotateCcw size={15} />恢复 {selectedCount} 张</button>
      <button type="button" className="danger-button" disabled={busy || selectedCount === 0} onClick={onDeletePermanently}><Trash2 size={15} />永久删除 {selectedCount} 张</button></>
      : <><label className="photo-selection-bar__category"><select aria-label="批量资料类型" value={category} disabled={busy || selectedCount === 0} onChange={(event) => onCategoryChange(event.target.value as PhotoKind)}><option value="other">其他</option><option value="english">英语</option><option value="essay">作文</option></select></label>
        <button type="button" className="secondary-button" disabled={busy || selectedCount === 0} onClick={onApplyCategory}>应用分类</button>
        <button type="button" className="danger-button" disabled={busy || selectedCount === 0} aria-label={`将 ${selectedCount} 张照片移入回收站`} onClick={onMoveToTrash}><Trash2 size={15} />移入回收站</button></>}
    <button type="button" className="secondary-button" disabled={busy} onClick={onClear}><X size={15} />取消</button>
  </section>;
}
