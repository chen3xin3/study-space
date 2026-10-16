import { describe, expect, it } from "vitest";
import { navigationGroups, navigationItems } from "./navigation";

describe("main navigation", () => {
  it("follows the approved study workflow", () => {
    expect(navigationItems.map(({ label, to }) => [label, to])).toEqual([
      ["首页", "/"],
      ["专注学习", "/focus"],
      ["英语", "/english"],
      ["数学", "/math"],
      ["专业课", "/specialty"],
      ["政治", "/politics"],
      ["学习统计", "/statistics"],
      ["资料库", "/library"],
      ["设置", "/settings"],
    ]);
    expect(navigationItems.map(({ label }) => label)).not.toContain("学习照片");
    expect(navigationItems.map(({ label }) => label)).not.toContain("收件箱");
  });

  it("keeps entries in the approved visual groups", () => {
    expect(navigationGroups.map(({ label, items }) => [label, items.map((item) => item.key)])).toEqual([
      ["总览", ["dashboard", "focus"]],
      ["备考科目", ["english", "math", "specialty", "politics"]],
      ["学习工具", ["statistics", "library"]],
      ["系统", ["settings"]],
    ]);
  });
});
