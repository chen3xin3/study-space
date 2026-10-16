import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { AiService } from "../../services/ai/ai.types";
import { AiServiceError } from "../../services/ai/ai.errors";
import { StudyItemEditorPage } from "./StudyItemEditorPage";
import { fakeLearningService, learningItem } from "./study-test-helpers";

function aiService(overrides: Partial<AiService> = {}): AiService {
  return {
    organizeTextMaterial: vi.fn().mockResolvedValue({
      title: "整理后的标题", subject: "math", collection: "wrong-questions", kind: "question",
      tags: ["导数", "单调性"], summary: "先求导，再根据导数符号划分区间。", keyPoints: ["定义域", "导数符号"],
    }),
    ...overrides,
  } as AiService;
}

function renderEditor(path: string, service = fakeLearningService(), ai = aiService()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/study/:subject/:collection/new" element={<StudyItemEditorPage service={service} aiService={ai} />} />
        <Route path="/study/:subject/:collection/:itemId" element={<StudyItemEditorPage service={service} aiService={ai} />} />
        <Route path="/study/:subject/:collection" element={<p>已返回资料列表</p>} />
        <Route path="/settings" element={<p>AI 设置</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudyItemEditorPage", () => {
  it("shows question-specific fields and creates a real question", async () => {
    const service = fakeLearningService();
    const user = userEvent.setup();
    renderEditor("/study/math/wrong-questions/new", service);

    expect(await screen.findByRole("heading", { name: "新建错题" })).toBeInTheDocument();
    expect(screen.getByLabelText("题目与错误过程")).toBeInTheDocument();
    expect(screen.getByLabelText("正确解法与错因复盘")).toBeInTheDocument();
    expect(screen.getByLabelText("知识点与题型")).toBeInTheDocument();
    expect(screen.getByLabelText("下次重做")).toBeInTheDocument();
    expect(screen.getByLabelText("掌握状态")).toBeInTheDocument();
    expect(screen.queryByLabelText("得分")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("标题"), "导数综合题");
    await user.type(screen.getByLabelText("题目与错误过程"), "求函数的单调区间");
    await user.type(screen.getByLabelText("正确解法与错因复盘"), "先求导，再讨论符号");
    await user.selectOptions(screen.getByLabelText("掌握状态"), "learning");
    await user.click(screen.getByRole("button", { name: "保存内容" }));

    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      subject: "math",
      collection: "wrong-questions",
      kind: "question",
      title: "导数综合题",
      content: "求函数的单调区间",
      answer: "先求导，再讨论符号",
      mastery: "learning",
    }));
    expect(await screen.findByText("已返回资料列表")).toBeInTheDocument();
  });

  it("uses score and review fields for an exam", async () => {
    const service = fakeLearningService([learningItem({
      id: "exam-1",
      subject: "politics",
      collection: "exams",
      kind: "exam",
      title: "政治模拟卷一",
      content: "选择题失分较多",
      score: 68,
      maxScore: 100,
    })]);
    renderEditor("/study/politics/exams/exam-1", service);

    expect(await screen.findByRole("heading", { name: "编辑模拟考试" })).toBeInTheDocument();
    expect(screen.getByLabelText("复盘内容")).toHaveValue("选择题失分较多");
    expect(screen.getByLabelText("得分")).toHaveValue(68);
    expect(screen.getByLabelText("满分")).toHaveValue(100);
    expect(screen.queryByLabelText("掌握状态")).not.toBeInTheDocument();
    expect(service.touchOpened).toHaveBeenCalledWith("exam-1", 1);
  });

  it("names an English exam entry as a paper record", async () => {
    renderEditor("/study/english/exams/new");
    expect(await screen.findByRole("heading", { name: "新建试卷记录" })).toBeInTheDocument();
    expect(screen.getByLabelText("试卷说明与整理备注")).toBeInTheDocument();
  });

  it("keeps note editing focused on title and body", async () => {
    renderEditor("/study/specialty/notes/new");
    expect(await screen.findByRole("heading", { name: "新建专业课笔记" })).toBeInTheDocument();
    expect(screen.getByLabelText("正文")).toBeInTheDocument();
    expect(screen.queryByLabelText("答案或解法")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("得分")).not.toBeInTheDocument();
  });

  it("previews AI title and tags without changing the form until they are applied", async () => {
    const api = fakeLearningService();
    const ai = aiService();
    const user = userEvent.setup();
    renderEditor("/study/math/wrong-questions/new", api, ai);
    await user.type(screen.getByLabelText("标题"), "原始标题");
    await user.type(screen.getByLabelText("题目与错误过程"), "求函数的单调区间");

    await user.click(screen.getByRole("button", { name: "AI 整理" }));
    expect(ai.organizeTextMaterial).toHaveBeenCalledWith(expect.objectContaining({
      subject: "math", collection: "wrong-questions", kind: "question", title: "原始标题", content: "求函数的单调区间",
    }));
    expect(screen.getByLabelText("标题")).toHaveValue("原始标题");
    expect(api.create).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "应用所选建议" }));
    expect(screen.getByLabelText("标题")).toHaveValue("整理后的标题");
    expect(screen.getByLabelText("知识点与题型")).toHaveValue("导数，单调性");
  });

  it("only appends the optional AI summary after explicit selection", async () => {
    const ai = aiService({ organizeTextMaterial: vi.fn().mockResolvedValue({
      title: "原始标题", subject: "math", collection: "wrong-questions", kind: "question", tags: [],
      summary: "一段摘要", keyPoints: ["要点一", "要点二"],
    }) });
    const user = userEvent.setup();
    renderEditor("/study/math/wrong-questions/new", fakeLearningService(), ai);
    await user.type(screen.getByLabelText("标题"), "原始标题");
    await user.type(screen.getByLabelText("题目与错误过程"), "原始正文");
    await user.click(screen.getByRole("button", { name: "AI 整理" }));
    expect(screen.getByLabelText("应用资料摘要与关键点")).not.toBeChecked();
    expect(screen.getByLabelText("题目与错误过程")).toHaveValue("原始正文");
    await user.click(screen.getByLabelText("应用资料摘要与关键点"));
    await user.click(screen.getByRole("button", { name: "应用所选建议" }));
    expect((screen.getByLabelText("题目与错误过程") as HTMLTextAreaElement).value).toContain("资料摘要\n一段摘要");
    expect((screen.getByLabelText("题目与错误过程") as HTMLTextAreaElement).value).toContain("关键知识点\n- 要点一\n- 要点二");
  });

  it("links to AI settings when organization is disabled", async () => {
    const ai = aiService({ organizeTextMaterial: vi.fn().mockRejectedValue(new AiServiceError("AI_DISABLED", "AI 功能尚未开启。")) });
    const user = userEvent.setup();
    renderEditor("/study/math/wrong-questions/new", fakeLearningService(), ai);
    await user.type(screen.getByLabelText("题目与错误过程"), "需要整理的正文");
    await user.click(screen.getByRole("button", { name: "AI 整理" }));
    expect(await screen.findByRole("link", { name: "前往 AI 设置" })).toHaveAttribute("href", "/settings#ai-assistant");
  });
});
