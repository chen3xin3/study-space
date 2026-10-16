import type { LearningItemDraft } from "./learning-item.types";

export function normalizeLearningItemInput(input: LearningItemDraft): LearningItemDraft {
  const title = input.title.trim();
  if (!title) throw new Error("请输入标题");
  if (title.length > 120) throw new Error("标题不能超过 120 个字符");
  if (input.content.length > 50_000 || input.answer.length > 50_000) throw new Error("正文或答案内容过长");

  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  const exam = input.kind === "exam";
  if (exam && input.score !== null && input.maxScore !== null && input.score > input.maxScore) {
    throw new Error("得分不能高于满分");
  }
  if (exam && ((input.score !== null && input.score < 0) || (input.maxScore !== null && input.maxScore <= 0))) {
    throw new Error("考试分数必须为有效正数");
  }

  return {
    ...input,
    title,
    content: input.content.trim(),
    answer: input.answer.trim(),
    tags,
    source: input.source.trim(),
    score: exam ? input.score : null,
    maxScore: exam ? input.maxScore : null,
  };
}
