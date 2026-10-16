import { Image, RotateCw, Trash2 } from "lucide-react";
import type { AttachmentRecord } from "../../services/data/data.types";

export interface SelectedImportImage {
  attachment: AttachmentRecord;
  rotationDegrees: number;
}

interface Props {
  images: SelectedImportImage[];
  disabled?: boolean;
  allowRotation?: boolean;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
}

export function ImageThumbnailList({ images, disabled, allowRotation = true, onRemove, onRotate }: Props) {
  if (!images.length) return null;
  return (
    <ul className="vocab-thumbnails" aria-label="已选照片">
      {images.map(({ attachment, rotationDegrees }, index) => (
        <li key={attachment.id}>
          <span className="vocab-thumbnail__preview" style={{ transform: `rotate(${rotationDegrees}deg)` }}><Image aria-hidden="true" /></span>
          <div><strong>第 {index + 1} 张</strong><span>{attachment.originalName}</span><small>{(attachment.byteSize / 1024 / 1024).toFixed(1)} MB</small></div>
          {allowRotation ? <button type="button" disabled={disabled} aria-label={`旋转 ${attachment.originalName}`} onClick={() => onRotate(attachment.id)}><RotateCw /></button> : <span />}
          <button type="button" disabled={disabled} aria-label={`删除 ${attachment.originalName}`} onClick={() => onRemove(attachment.id)}><Trash2 /></button>
        </li>
      ))}
    </ul>
  );
}
