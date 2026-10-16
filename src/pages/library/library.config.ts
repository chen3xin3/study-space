import {
  BookOpenText,
  Calculator,
  FileClock,
  Files,
  Flag,
  FolderHeart,
  GraduationCap,
  Images,
  LibraryBig,
  NotebookPen,
  Shapes,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type LibrarySubjectKey = "all" | "english" | "math" | "specialty" | "politics" | "other";
export type LibraryViewKey = "recent" | "favorites" | "trash";

export interface LibrarySubject {
  key: LibrarySubjectKey;
  label: string;
  description: string;
  search: string;
  tone: string;
  icon: LucideIcon;
}

export const librarySubjects: LibrarySubject[] = [
  { key: "all", label: "全部资料", description: "从一个入口查看所有学习资料", search: "", tone: "green", icon: LibraryBig },
  { key: "english", label: "英语", description: "单词、作文、真题与学习照片", search: "?subject=english", tone: "blue", icon: BookOpenText },
  { key: "math", label: "数学", description: "讲义、错题、笔记与练习资料", search: "?subject=math", tone: "amber", icon: Calculator },
  { key: "specialty", label: "专业课", description: "教材、专题笔记与复习文件", search: "?subject=specialty", tone: "violet", icon: GraduationCap },
  { key: "politics", label: "政治", description: "背诵材料、时政与刷题记录", search: "?subject=politics", tone: "rose", icon: Flag },
  { key: "other", label: "其他", description: "暂未归类和跨科目的资料", search: "?subject=other", tone: "slate", icon: Shapes },
];

export const libraryCollections = [
  { key: "photos", label: "学习照片", description: "按学习日期回看纸质笔记、作文和背诵材料", to: "/library/photos", tone: "teal", icon: Images },
  { key: "files", label: "文件与笔记", description: "整理 PDF、Word、图片、文本和临时笔记", to: "/library/files", tone: "gold", icon: Files },
] as const;

export const englishCollections = [
  { key: "words", label: "单词本", description: "查看单词、标签和复习记录", to: "/english/words", icon: NotebookPen },
  { key: "essays", label: "作文库", description: "查看作文原文、批注和学习记录", to: "/english/essays", icon: BookOpenText },
] as const;

export const libraryPublicViews: { key: LibraryViewKey; label: string; description: string; icon: LucideIcon }[] = [
  { key: "recent", label: "最近使用", description: "后续将在这里汇总最近打开的资料", icon: FileClock },
  { key: "favorites", label: "收藏", description: "后续将在这里集中显示收藏内容", icon: FolderHeart },
  { key: "trash", label: "回收站", description: "文件资料的最近移除内容仍可在文件区恢复", icon: Trash2 },
];
