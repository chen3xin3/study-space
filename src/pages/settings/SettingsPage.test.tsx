import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { SettingsProvider } from "../../services/settings/SettingsProvider";
import { SettingsPage } from "./SettingsPage";
import type { AiService } from "../../services/ai/ai.types";
import { useRuntimePlatform } from "../../platform/useRuntimePlatform";

vi.mock("../../platform/useRuntimePlatform", () => ({
  useRuntimePlatform: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useRuntimePlatform).mockReturnValue("windows");
});

function aiService(overrides: Partial<AiService> = {}): AiService {
  return {
    getSettings: vi.fn().mockResolvedValue({ enabled: false, providerName: "OpenAI Compatible", apiUrl: "https://api.example.com/v1", model: "vision-model", hasApiKey: false, version: 1 }),
    updateSettings: vi.fn().mockResolvedValue({ enabled: true, providerName: "OpenAI Compatible", apiUrl: "https://api.example.com/v1", model: "vision-model", hasApiKey: false, version: 2 }),
    setApiKey: vi.fn().mockResolvedValue({ enabled: true, providerName: "OpenAI Compatible", apiUrl: "https://api.example.com/v1", model: "vision-model", hasApiKey: true, version: 2 }),
    deleteApiKey: vi.fn(), testConnection: vi.fn(), reviewEssay: vi.fn(), recognizeEssayImages: vi.fn(), retryReview: vi.fn(), getReview: vi.fn(), confirmReview: vi.fn(),
    ...overrides,
  } as AiService;
}

it("offers all appearance, exam and math settings", () => {
  render(<SettingsProvider><SettingsPage /></SettingsProvider>);
  expect(screen.getByRole("navigation", { name: "设置分类" })).toBeInTheDocument();
  for (const label of ["外观", "学习目标", "阅读体验", "数据管理", "设备互联", "AI 助手"]) {
    expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
  }
  expect(screen.getAllByRole("radio", { name: /主题/ })).toHaveLength(6);
  expect(screen.getByLabelText("考试日期")).toBeInTheDocument();
  expect(screen.getByLabelText("数学类型")).toBeInTheDocument();
  expect(screen.getByLabelText("字体大小")).toBeInTheDocument();
  expect(screen.getByLabelText("界面密度")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "本地数据与备份" })).toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "显示手动录入" })).not.toBeInTheDocument();
});

it("saves the desktop AI connection used by photo recognition", async () => {
  const user = userEvent.setup();
  const api = aiService();
  render(<SettingsProvider><SettingsPage aiService={api} /></SettingsProvider>);
  const toggle = screen.getByRole("switch", { name: "启用 AI 学习助手" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  await user.click(toggle);
  await user.clear(screen.getByLabelText("API Key"));
  await user.type(screen.getByLabelText("API Key"), "secret");
  await user.click(screen.getByRole("button", { name: "保存 AI 配置" }));
  expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, apiUrl: "https://api.example.com/v1", model: "vision-model", version: 1 }));
  expect(api.setApiKey).toHaveBeenCalledWith("secret");
});

it("hides Windows-only settings and uses device wording on Android", async () => {
  vi.mocked(useRuntimePlatform).mockReturnValue("android");
  render(<SettingsProvider><SettingsPage aiService={aiService()} /></SettingsProvider>);

  expect(screen.queryByRole("heading", { name: "桌面行为" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "问题诊断" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "桌面行为" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "问题诊断" })).not.toBeInTheDocument();
  expect(screen.getByText("学习记录、附件和设置都保存在这台设备上。")).toBeInTheDocument();

  const toggle = screen.getByRole("switch", { name: "启用 AI 学习助手" });
  await userEvent.click(toggle);
  expect(screen.getByText("密钥通过设备安全存储保存")).toBeInTheDocument();
});

it("keeps desktop controls on Windows", () => {
  render(<SettingsProvider><SettingsPage aiService={aiService()} /></SettingsProvider>);
  expect(screen.getByRole("heading", { name: "桌面行为" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "问题诊断" })).toBeInTheDocument();
  expect(screen.getByText("学习记录、附件和设置都保存在这台电脑上。")).toBeInTheDocument();
});
