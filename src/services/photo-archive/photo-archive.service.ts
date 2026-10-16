import { BrowserPhotoArchiveService } from "./browser-photo-archive.service";
import { TauriPhotoArchiveService } from "./tauri-photo-archive.service";
import type { PhotoArchiveService } from "./photo-archive.types";

export function createPhotoArchiveService(): PhotoArchiveService {
  return (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ? new TauriPhotoArchiveService()
    : new BrowserPhotoArchiveService();
}
