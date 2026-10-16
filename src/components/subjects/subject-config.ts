import {
  Archive,
  BookOpenText,
  Brain,
  Calculator,
  FilePlus2,
  FileText,
  GraduationCap,
  Landmark,
  ListChecks,
  NotebookPen,
  PenLine,
  RefreshCw,
  Search,
  type LucideIcon,
} from "lucide-react";

export type SubjectId = "english" | "math" | "specialty" | "politics";
export type SubjectArtDirection = "paper" | "calm" | "bookshelf" | "newsroom";
export type SubjectFeatureLayout = "floating" | "wide" | "compact" | "strip" | "shelf" | "paper" | "headline" | "accent";

export interface SubjectFeature { id: string; title: string; description: string; icon: LucideIcon; layout: SubjectFeatureLayout; path: string; }
export interface SubjectPageConfig {
  id: SubjectId;
  title: string;
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  icon: LucideIcon;
  artDirection: SubjectArtDirection;
  features: SubjectFeature[];
}

export const subjectConfigs: Record<SubjectId, SubjectPageConfig> = {
  english: {
    id: "english", title: "英语", eyebrow: "英语学习空间", heroTitle: "已录单词", heroDescription: "按日期查看、搜索并管理你的词汇积累。", icon: BookOpenText, artDirection: "paper",
    features: [
      { id: "add-word", title: "拍照导入单词", description: "识别纸上的单词与注释", icon: FilePlus2, layout: "floating", path: "/english/words/import" },
      { id: "review-words", title: "单词复习", description: "英译中、中译英与掌握反馈", icon: RefreshCw, layout: "wide", path: "/english/review" },
      { id: "essays", title: "作文中心", description: "范文、默写、写作与批改记录", icon: PenLine, layout: "compact", path: "/english/essays" },
      { id: "exams", title: "试卷资料库", description: "保存套卷信息、成绩与整理备注", icon: FileText, layout: "strip", path: "/study/english/exams" },
    ],
  },
  math: {
    id: "math", title: "数学", eyebrow: "", heroTitle: "知识体系", heroDescription: "按章节整理公式、例题与错题。", icon: Calculator, artDirection: "calm",
    features: [
      { id: "add-question", title: "录入错题", description: "记录题目、错误过程和正确解法", icon: FilePlus2, layout: "floating", path: "/study/math/wrong-questions/new" },
      { id: "question-bank", title: "我的错题库", description: "筛选、重做并更新掌握状态", icon: Archive, layout: "wide", path: "/study/math/wrong-questions" },
      { id: "notes-examples", title: "笔记与例题", description: "围绕知识点沉淀方法", icon: NotebookPen, layout: "compact", path: "/study/math/notes-examples" },
      { id: "exams", title: "模拟考试", description: "记录试卷、答卷与多次成绩", icon: FileText, layout: "strip", path: "/study/math/exams" },
    ],
  },
  specialty: {
    id: "specialty", title: "专业课", eyebrow: "专业课学习空间", heroTitle: "教材与知识体系", heroDescription: "自定义专业课名称、教材、章节与知识点。", icon: GraduationCap, artDirection: "bookshelf",
    features: [
      { id: "textbooks", title: "教材管理", description: "管理教材、章节和学习进度", icon: BookOpenText, layout: "shelf", path: "/study/specialty/textbooks" },
      { id: "knowledge", title: "知识体系", description: "关联笔记、例题和复习记录", icon: Brain, layout: "shelf", path: "/study/specialty/knowledge" },
      { id: "notes", title: "笔记", description: "保存文字、图片和附件", icon: NotebookPen, layout: "paper", path: "/study/specialty/notes" },
      { id: "examples", title: "例题", description: "按章节沉淀典型解法", icon: FileText, layout: "paper", path: "/study/specialty/examples" },
      { id: "questions", title: "题库", description: "按章节组织练习题", icon: ListChecks, layout: "paper", path: "/study/specialty/questions" },
      { id: "wrong-questions", title: "错题库", description: "整理错因并安排重做", icon: Archive, layout: "paper", path: "/study/specialty/wrong-questions" },
      { id: "reviews", title: "复习记录", description: "记录每轮复习与掌握情况", icon: RefreshCw, layout: "shelf", path: "/study/specialty/reviews" },
      { id: "exams", title: "模拟考试", description: "主观题练习和考试记录", icon: FileText, layout: "strip", path: "/study/specialty/exams" },
    ],
  },
  politics: {
    id: "politics", title: "政治", eyebrow: "政治学习空间", heroTitle: "知识与背诵体系", heroDescription: "把知识笔记、背诵、练习与错题串联起来。", icon: Landmark, artDirection: "newsroom",
    features: [
      { id: "knowledge", title: "知识体系", description: "知识点、笔记和掌握状态", icon: Brain, layout: "headline", path: "/study/politics/knowledge" },
      { id: "recitation", title: "背诵", description: "安排背诵并保存复习记录", icon: BookOpenText, layout: "accent", path: "/study/politics/recitation" },
      { id: "dictation", title: "默写", description: "主动回忆与结果核对", icon: PenLine, layout: "compact", path: "/study/politics/dictation" },
      { id: "choice", title: "选择题练习", description: "练习、错题与原因整理", icon: ListChecks, layout: "accent", path: "/study/politics/choice" },
      { id: "subjective", title: "主观题练习", description: "答案、评分点与改进记录", icon: FileText, layout: "wide", path: "/study/politics/subjective" },
      { id: "search", title: "错题整理", description: "按知识点和掌握状态筛选", icon: Search, layout: "compact", path: "/study/politics/wrong-questions" },
      { id: "exams", title: "模拟考试", description: "记录整套练习与阶段成绩", icon: FileText, layout: "strip", path: "/study/politics/exams" },
    ],
  },
};
