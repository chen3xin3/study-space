import type { FocusHistoryItem, FocusService } from "../../services/focus/focus.types";

const PAGE_SIZE = 30;
const MAX_OFFSET = 100_000;

export async function loadAllFocusHistory(service: FocusService): Promise<FocusHistoryItem[]> {
  const result: FocusHistoryItem[] = [];
  for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE_SIZE) {
    const page = await service.listHistory(offset);
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
  }
  return result;
}
