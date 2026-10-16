import type { CreateFocusPlanInput, FocusPlan, FocusPlanService, SetFocusPlanCompletedInput, UpdateFocusPlanInput } from "./focus.types";
import type { VersionedIdInput } from "../dashboard/dashboard.types";
import { focusUid, readFocusState, writeFocusState } from "./browser-focus.store";

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
const weekday = (value: string) => new Date(`${value}T00:00:00`).getDay();

export class BrowserFocusPlanService implements FocusPlanService {
  async list(localDate: string): Promise<FocusPlan[]> {
    if (!validDate(localDate)) throw new Error("日期格式不正确");
    const state = readFocusState();
    const sources = state.plans.filter((item) => item.localDate < localDate && item.repeatRule !== "none" && !item.id.startsWith("repeat:"));
    for (const source of sources) {
      const day = weekday(localDate);
      const due = source.repeatRule === "daily"
        || (source.repeatRule === "weekdays" && day !== 0 && day !== 6)
        || (source.repeatRule === "weekly" && weekday(source.localDate) === day);
      const id = `repeat:${source.id}:${localDate}`;
      if (due && !state.plans.some((item) => item.id === id)) {
        const now = new Date().toISOString();
        state.plans.push({ ...source, id, localDate, completedCycles: 0, completedAt: null, position: state.plans.filter((item) => item.localDate === localDate).length, createdAt: now, updatedAt: now, version: 1 });
      }
    }
    writeFocusState(state);
    return state.plans.filter((item) => item.localDate === localDate).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: CreateFocusPlanInput): Promise<FocusPlan> {
    const title = input.title.trim();
    if (!title || title.length > 80 || !validDate(input.localDate) || input.estimatedCycles < 1 || input.estimatedCycles > 24) throw new Error("专注任务设置不正确");
    const state = readFocusState(); const now = new Date().toISOString();
    const plan: FocusPlan = { ...input, learningItemId: input.learningItemId ?? null, title, id: focusUid(), completedCycles: 0, completedAt: null, position: state.plans.filter((item) => item.localDate === input.localDate).length, createdAt: now, updatedAt: now, version: 1 };
    state.plans.push(plan); writeFocusState(state); return plan;
  }

  async update(input: UpdateFocusPlanInput): Promise<FocusPlan> {
    const state = readFocusState(); const plan = state.plans.find((item) => item.id === input.id && item.version === input.version);
    if (!plan) throw new Error("专注任务已发生变化，请重试");
    Object.assign(plan, input, { learningItemId: input.learningItemId ?? null, title: input.title.trim(), updatedAt: new Date().toISOString(), version: plan.version + 1 });
    writeFocusState(state); return plan;
  }

  async setCompleted(input: SetFocusPlanCompletedInput): Promise<FocusPlan> {
    const state = readFocusState(); const plan = state.plans.find((item) => item.id === input.id && item.version === input.version);
    if (!plan) throw new Error("专注任务已发生变化，请重试");
    plan.completedAt = input.completed ? new Date().toISOString() : null; plan.updatedAt = new Date().toISOString(); plan.version++;
    writeFocusState(state); return plan;
  }

  async delete(input: VersionedIdInput): Promise<void> {
    const state = readFocusState(); const index = state.plans.findIndex((item) => item.id === input.id && item.version === input.version);
    if (index < 0) throw new Error("专注任务已发生变化，请重试");
    state.plans.splice(index, 1); writeFocusState(state);
  }

  async reorder(localDate: string, orderedIds: string[]): Promise<FocusPlan[]> {
    const state = readFocusState(); const plans = state.plans.filter((item) => item.localDate === localDate);
    if (new Set(orderedIds).size !== orderedIds.length || plans.length !== orderedIds.length || plans.some((item) => !orderedIds.includes(item.id))) throw new Error("任务顺序不完整");
    const now = new Date().toISOString();
    orderedIds.forEach((id, position) => { const plan = plans.find((item) => item.id === id)!; plan.position = position; plan.updatedAt = now; plan.version++; });
    writeFocusState(state); return orderedIds.map((id) => plans.find((item) => item.id === id)!);
  }
}
