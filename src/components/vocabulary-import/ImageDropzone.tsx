import { useRef, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Camera, ClipboardPaste, Images } from "lucide-react";

interface Props {
  disabled?: boolean;
  title?: string;
  desktopTitle?: string;
  description?: string;
  onChoose?: () => void;
  onFiles: (files: File[]) => void;
}

export function ImageDropzone({ disabled, title = "把单词纸照片放到这里", desktopTitle = "拖入单词纸照片，或从电脑选择", description = "支持 PNG、JPG、WebP；最多 4 张，每张不超过 10 MB。", onFiles }: Props) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const accept = (files: FileList | null) => files && onFiles([...files]);
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    accept(event.target.files);
    event.target.value = "";
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) accept(event.dataTransfer.files);
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = [...event.clipboardData.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!disabled && files.length) {
      event.preventDefault();
      onFiles(files);
    }
  };
  return (
    <div className="vocab-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={drop} onPaste={paste} tabIndex={0} aria-label="照片选择区">
      <span className="vocab-dropzone__icon"><Images aria-hidden="true" /></span>
      <h2><span className="upload-copy upload-copy--desktop">{desktopTitle}</span><span className="upload-copy upload-copy--touch">{title}</span></h2>
      <p>{description}</p>
      <div className="vocab-dropzone__actions">
        <input ref={cameraInput} className="image-source-input" data-image-source="camera" type="file" accept="image/*" capture="environment" disabled={disabled} onChange={select} />
        <input ref={galleryInput} className="image-source-input" data-image-source="gallery" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled} onChange={select} />
        <button className="primary-button" type="button" disabled={disabled} onClick={() => cameraInput.current?.click()}><Camera size={17} />拍照</button>
        <button aria-label="选择照片" className="secondary-button" type="button" disabled={disabled} onClick={() => galleryInput.current?.click()}><Images size={17} /><span className="upload-copy upload-copy--desktop">从电脑选择</span><span className="upload-copy upload-copy--touch">从相册选择</span></button>
        <span className="desktop-import-hint"><ClipboardPaste size={16} />电脑端也可以按 Ctrl+V 粘贴截图</span>
      </div>
    </div>
  );
}
