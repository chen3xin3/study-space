import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { VocabularyService } from "../../services/vocabulary/vocabulary.types";
import { EnglishDashboard } from "./EnglishDashboard";
import { SettingsProvider } from "../../services/settings/SettingsProvider";

function service(): VocabularyService {
  return {
    createWord: vi.fn(),
    resolveDuplicate: vi.fn(),
    getWord: vi.fn(),
    listWords: vi.fn(),
    updateWord: vi.fn(),
    deleteWords: vi.fn(),
    updateWordTags: vi.fn(),
    scheduleWordsForToday: vi.fn(),
    getReviewQueue: vi.fn(),
    submitReview: vi.fn(),
    rescheduleReview: vi.fn(),
    getSummary: vi.fn().mockResolvedValue({
      totalWords: 128,
      learnedToday: 6,
      dueToday: 12,
      reviewedToday: 4,
      learnedThisWeek: 31,
      knownThisWeek: 18,
      fuzzyThisWeek: 5,
      unknownThisWeek: 2,
    }),
  };
}

it("presents English as a resource space without review statistics", async () => {
  render(<SettingsProvider><MemoryRouter><EnglishDashboard service={service()} /></MemoryRouter></SettingsProvider>);
  expect(screen.queryByText("有效单词")).not.toBeInTheDocument();
  expect(screen.queryByText("今日学习")).not.toBeInTheDocument();
  expect(screen.queryByText("今日待复习")).not.toBeInTheDocument();
  expect(screen.queryByText("今日已复习")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /拍照导入单词/ })[0]).toHaveAttribute("href", "/english/words/import");
  expect(screen.getAllByRole("link", { name: /拍照导入作文/ })[0]).toHaveAttribute("href", "/english/essays/import");
  expect(screen.queryByRole("link", { name: /手动录入|新建范文/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /开始复习/ })).not.toBeInTheDocument();
  expect(screen.getByText("单词资料库").closest("a")).toHaveAttribute("href", "/english/words");
  expect(screen.getByText("作文资料库").closest("a")).toHaveAttribute("href", "/english/essays");
  expect(screen.getByText("试卷资料库").closest("a")).toHaveAttribute("href", "/study/english/exams");
  expect(screen.queryByText("继续学习")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /单词复习/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /模拟考试/ })).not.toBeInTheDocument();
});

it("does not depend on review statistics to render the English space", async () => {
  const api = service();
  vi.mocked(api.getSummary).mockRejectedValue(new Error("统计读取失败"));
  render(<SettingsProvider><MemoryRouter><EnglishDashboard service={api} /></MemoryRouter></SettingsProvider>);
  expect(screen.getByRole("heading", { name: "英语" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.getSummary).not.toHaveBeenCalled();
});

it("keeps photo intake visible without a manual-entry preference", async () => {
  render(<SettingsProvider><MemoryRouter><EnglishDashboard service={service()} /></MemoryRouter></SettingsProvider>);
  expect(screen.queryByRole("link", { name: /手动录入/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /拍照导入单词/ })[0]).toHaveAttribute("href", "/english/words/import");
});

it("renders the English space as a calm modern resource page", () => {
  render(<SettingsProvider><MemoryRouter><EnglishDashboard service={service()} /></MemoryRouter></SettingsProvider>);
  expect(screen.getByTestId("english-resource-space")).toHaveAttribute("data-art-direction", "color-archive");
  expect(screen.getByRole("heading", { name: "英语" })).toBeInTheDocument();
  for (const removed of ["英语手帐", "ENGLISH / PERSONAL ARCHIVE", "ARCHIVE DRAWERS", "NO. 01", "WORD SNAP", "DRAFT / 02", "word", "note", "review"]) {
    expect(screen.queryByText(removed)).not.toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: /按日期看原始照片/ })).toHaveAttribute("href", "/library/photos?kind=english");
  expect(screen.getByRole("region", { name: "拍照导入" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "英语资料库" })).toBeInTheDocument();
});
