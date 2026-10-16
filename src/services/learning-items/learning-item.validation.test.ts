import { describe, expect, it } from "vitest";
import { normalizeLearningItemInput } from "./learning-item.validation";

describe("learning item validation", () => {
  it("normalizes a question without exam-only fields", () => {
    expect(normalizeLearningItemInput({
      subject: "math",
      collection: "wrong-questions",
      kind: "question",
      title: "  极限计算  ",
      content: "  题目  ",
      answer: "  洛必达法则  ",
      tags: [" 高数 ", "高数", ""],
      mastery: "learning",
      source: " 第一章 ",
      score: 80,
      maxScore: 100,
      reviewAt: "2026-10-10",
    })).toEqual({
      subject: "math",
      collection: "wrong-questions",
      kind: "question",
      title: "极限计算",
      content: "题目",
      answer: "洛必达法则",
      tags: ["高数"],
      mastery: "learning",
      source: "第一章",
      score: null,
      maxScore: null,
      reviewAt: "2026-10-10",
    });
  });

  it("rejects an empty title", () => {
    expect(() => normalizeLearningItemInput({
      subject: "politics",
      collection: "recitation",
      kind: "practice",
      title: " ",
      content: "",
      answer: "",
      tags: [],
      mastery: "new",
      source: "",
      score: null,
      maxScore: null,
      reviewAt: null,
    })).toThrow("请输入标题");
  });

  it("rejects an exam score above its maximum", () => {
    expect(() => normalizeLearningItemInput({
      subject: "math",
      collection: "exams",
      kind: "exam",
      title: "模拟考试",
      content: "",
      answer: "",
      tags: [],
      mastery: "new",
      source: "",
      score: 120,
      maxScore: 100,
      reviewAt: null,
    })).toThrow("得分不能高于满分");
  });
});
