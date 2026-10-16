import type { LearningItemKind, LearningSubject } from "../../services/learning-items/learning-item.types";

export type StudyEditorMode = "list" | "create";

export interface StudyWorkspaceConfig {
  subject: LearningSubject;
  feature: string;
  collection: string;
  kind: LearningItemKind;
  title: string;
  description: string;
  editorMode: StudyEditorMode;
  path: string;
}

const workspace = (
  subject: LearningSubject,
  feature: string,
  collection: string,
  kind: LearningItemKind,
  title: string,
  description: string,
  editorMode: StudyEditorMode = "list",
): StudyWorkspaceConfig => ({
  subject,
  feature,
  collection,
  kind,
  title,
  description,
  editorMode,
  path: `/study/${subject}/${collection}${editorMode === "create" ? "/new" : ""}`,
});

export const studyWorkspaces: StudyWorkspaceConfig[] = [
  workspace("english", "exams", "exams", "exam", "英语试卷资料库", "保存套卷信息、成绩与整理备注"),

  workspace("math", "add-question", "wrong-questions", "question", "录入错题", "保存题目、解法与错因", "create"),
  workspace("math", "question-bank", "wrong-questions", "question", "我的错题库", "筛选、重做并更新掌握状态"),
  workspace("math", "notes-examples", "notes-examples", "note", "笔记与例题", "围绕章节沉淀公式与方法"),
  workspace("math", "exams", "exams", "exam", "数学模拟考试", "记录试卷、成绩与复盘"),

  workspace("specialty", "textbooks", "textbooks", "material", "教材管理", "管理教材、章节与学习进度"),
  workspace("specialty", "knowledge", "knowledge", "note", "知识体系", "整理知识点与关联说明"),
  workspace("specialty", "notes", "notes", "note", "专业课笔记", "保存文字笔记与资料来源"),
  workspace("specialty", "examples", "examples", "practice", "专业课例题", "按章节沉淀典型解法"),
  workspace("specialty", "questions", "questions", "question", "专业课题库", "按章节组织练习题"),
  workspace("specialty", "wrong-questions", "wrong-questions", "question", "专业课错题库", "整理错因并安排重做"),
  workspace("specialty", "reviews", "reviews", "practice", "复习记录", "记录每轮复习与掌握情况"),
  workspace("specialty", "exams", "exams", "exam", "专业课模拟考试", "记录主观题练习与阶段成绩"),

  workspace("politics", "knowledge", "knowledge", "note", "政治知识体系", "整理知识点、笔记与掌握状态"),
  workspace("politics", "recitation", "recitation", "practice", "政治背诵", "安排背诵并保存复习记录"),
  workspace("politics", "dictation", "dictation", "practice", "政治默写", "主动回忆并核对结果"),
  workspace("politics", "choice", "choice", "question", "选择题练习", "练习、错题与原因整理"),
  workspace("politics", "subjective", "subjective", "question", "主观题练习", "保存答案、评分点与改进记录"),
  workspace("politics", "search", "wrong-questions", "question", "政治错题整理", "按知识点和掌握状态筛选"),
  workspace("politics", "exams", "exams", "exam", "政治模拟考试", "记录整套练习与阶段成绩"),
];

export function getStudyWorkspace(subject: LearningSubject, feature: string): StudyWorkspaceConfig {
  const found = studyWorkspaces.find((item) => item.subject === subject && item.feature === feature);
  if (!found) throw new Error(`未配置学习功能：${subject}/${feature}`);
  return found;
}

export function getStudyCollection(subject: LearningSubject, collection: string): StudyWorkspaceConfig {
  const candidates = studyWorkspaces.filter((item) => item.subject === subject && item.collection === collection);
  const found = candidates.find((item) => item.editorMode === "list") ?? candidates[0];
  if (!found) throw new Error(`未配置学习集合：${subject}/${collection}`);
  return found;
}

export function findStudyCollection(
  subject: LearningSubject,
  collection: string,
  kind: LearningItemKind,
): StudyWorkspaceConfig | null {
  return studyWorkspaces.find((item) =>
    item.editorMode === "list"
    && item.subject === subject
    && item.collection === collection
    && item.kind === kind,
  ) ?? null;
}
