import { afterEach, expect, it } from "vitest";
import { BrowserLearningItemService } from "./browser-learning-item.service";
import { createLearningItemService } from "./learning-item.service";
import { TauriLearningItemService } from "./tauri-learning-item.service";

afterEach(() => {
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

it("selects browser and Tauri learning services by runtime", () => {
  expect(createLearningItemService()).toBeInstanceOf(BrowserLearningItemService);
  Object.assign(window, { __TAURI_INTERNALS__: {} });
  expect(createLearningItemService()).toBeInstanceOf(TauriLearningItemService);
});
