import { Image, RotateCw } from "lucide-react";
import type { ImportImage } from "../../services/vocabulary-import/vocabulary-import.types";

export function ImportImageViewer({ images, activeId, onSelect, onRotate }: { images: ImportImage[]; activeId: string | null; onSelect: (id: string) => void; onRotate: (image: ImportImage) => void }) {
  const active = images.find((image) => image.attachmentId === activeId) ?? images[0];
  return <section className="import-image-viewer" aria-label="来源照片">
    <div className="import-image-viewer__canvas"><Image size={64} aria-hidden="true" /><strong>{active?.originalName ?? "暂无照片"}</strong>{active ? <span>旋转 {active.rotationDegrees}°</span> : null}</div>
    <div className="import-image-viewer__tabs">{images.map((image, index) => <button className={image.attachmentId === active?.attachmentId ? "is-active" : ""} type="button" key={image.attachmentId} onClick={() => onSelect(image.attachmentId)}>第 {index + 1} 张</button>)}</div>
    {active ? <button className="secondary-button" type="button" onClick={() => onRotate(active)}><RotateCw size={16} />旋转照片</button> : null}
  </section>;
}
