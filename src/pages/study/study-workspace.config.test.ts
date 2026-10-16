import { describe, expect, it } from "vitest";
import { subjectConfigs } from "../../components/subjects/subject-config";
import { findStudyCollection, getStudyCollection, getStudyWorkspace } from "./study-workspace.config";

describe("study workspace configuration", () => {
  it("maps every visible non-English feature to a real workspace", () => {
    for (const subject of ["math", "specialty", "politics"] as const) {
      for (const feature of subjectConfigs[subject].features) {
        expect(() => getStudyWorkspace(subject, feature.id)).not.toThrow();
      }
    }
    expect(getStudyWorkspace("math", "add-question")).toMatchObject({ collection: "wrong-questions", kind: "question", editorMode: "create" });
    expect(getStudyWorkspace("specialty", "textbooks")).toMatchObject({ collection: "textbooks", kind: "material" });
    expect(getStudyWorkspace("politics", "subjective")).toMatchObject({ collection: "subjective", kind: "question" });
    expect(getStudyWorkspace("english", "exams")).toMatchObject({ collection: "exams", kind: "exam", title: "英语试卷资料库" });
  });

  it("resolves aliases to one collection configuration", () => {
    expect(getStudyCollection("math", "wrong-questions")).toMatchObject({ title: "我的错题库", kind: "question" });
    expect(getStudyWorkspace("math", "question-bank").collection).toBe("wrong-questions");
  });

  it("rejects unknown workspaces instead of creating placeholders", () => {
    expect(() => getStudyWorkspace("math", "missing")).toThrow("未配置学习功能");
  });

  it("only accepts a complete classification backed by a list route", () => {
    expect(findStudyCollection("math", "wrong-questions", "question")).toMatchObject({ feature: "question-bank" });
    expect(findStudyCollection("math", "wrong-questions", "note")).toBeNull();
    expect(findStudyCollection("other", "misc", "material")).toBeNull();
  });
});
