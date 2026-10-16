import { describe, expect, it } from "vitest";
import type { LearningItem } from "../../../services/learning-items/learning-item.types";
import type { PhotoRecord } from "../../../services/photo-archive/photo-archive.types";
import {
  advanceQueue,
  currentQueueItem,
  markAnalyzing,
  markApplied,
  markFailed,
  markReviewing,
  markSkipped,
  queueSummary,
  retryCurrent,
  selectCandidates,
  startQueue,
  toggleCandidate,
  type OrganizationCandidate,
} from "./organization-queue";

const learningRecord = (id: string): LearningItem => ({
  id, subject: "math", collection: "wrong-questions", kind: "question", title: `资料 ${id}`,
  content: "", answer: "", tags: [], mastery: "new", source: "", score: null, maxScore: null,
  reviewAt: null, favorite: false, lastOpenedAt: "2026-10-11T01:00:00Z", createdAt: "2026-10-11T01:00:00Z",
  updatedAt: "2026-10-11T01:00:00Z", deletedAt: null, version: 1,
});

const photoRecord = (id: string): PhotoRecord => ({
  attachmentId: id, studyDate: "2026-10-11", studyDateConfirmed: true, title: `照片 ${id}`, kind: "other",
  memorized: false, originalName: `${id}.jpg`, mediaType: "image/jpeg", createdAt: "2026-10-11T01:00:00Z",
  updatedAt: "2026-10-11T01:00:00Z", version: 1, deletedAt: null,
});

const learning = (id: string): OrganizationCandidate => ({
  id: `learning:${id}`, source: "learning", title: `资料 ${id}`, subject: "math", updatedAt: "2026-10-11T01:00:00Z", record: learningRecord(id),
});
const photo = (id: string): OrganizationCandidate => ({
  id: `photo:${id}`, source: "photo", title: `照片 ${id}`, subject: null, updatedAt: "2026-10-11T01:00:00Z", record: photoRecord(id),
});

describe("organization queue selection", () => {
  it("selects across sources without duplicates and allows removal at the limit", () => {
    const first = learning("1");
    const mixed = toggleCandidate(toggleCandidate([], first), photo("1"));
    expect(mixed.map((item) => item.id)).toEqual(["learning:1", "photo:1"]);
    expect(toggleCandidate(mixed, first)).toEqual([mixed[1]]);
    expect(toggleCandidate([first], first)).toEqual([]);
  });

  it("rejects more than ten selected records", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => learning(String(index)));
    expect(() => selectCandidates(eleven)).toThrow("一次最多整理 10 条资料");
    expect(() => toggleCandidate(eleven.slice(0, 10), photo("overflow"))).toThrow("一次最多整理 10 条资料");
  });
});

describe("organization queue transitions", () => {
  it("processes one current item at a time and summarizes terminal states", () => {
    const started = startQueue([learning("1"), photo("1")]);
    expect(currentQueueItem(started)?.candidate.id).toBe("learning:1");
    const analyzing = markAnalyzing(started);
    expect(analyzing.items.map((item) => item.status)).toEqual(["analyzing", "waiting"]);
    const reviewing = markReviewing(analyzing, {
      title: "整理后的资料", subject: "math", collection: "wrong-questions", kind: "question", tags: ["极限"], summary: "摘要", keyPoints: ["关键点"],
    });
    expect(currentQueueItem(reviewing)?.status).toBe("reviewing");
    const next = advanceQueue(markApplied(reviewing));
    expect(currentQueueItem(next)?.candidate.id).toBe("photo:1");
    const done = markSkipped(next);
    expect(queueSummary(done)).toEqual({ applied: 1, skipped: 1, failed: 0, pending: 0 });
  });

  it("keeps a failed item current and makes retry return it to waiting", () => {
    const failed = markFailed(markAnalyzing(startQueue([learning("1")])), "服务超时");
    expect(currentQueueItem(failed)).toMatchObject({ status: "failed", error: "服务超时" });
    expect(currentQueueItem(retryCurrent(failed))).toMatchObject({ status: "waiting", error: "" });
  });

  it("does not advance past an item that is not terminal", () => {
    const reviewing = markReviewing(markAnalyzing(startQueue([learning("1"), photo("1")])), {
      title: "建议", subject: "math", collection: "wrong-questions", kind: "question", tags: [], summary: "", keyPoints: [],
    });
    expect(advanceQueue(reviewing)).toEqual(reviewing);
  });
});
