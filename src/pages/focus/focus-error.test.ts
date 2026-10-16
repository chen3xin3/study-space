import { describe, expect, it } from "vitest";
import { focusErrorCode, focusErrorMessage } from "./focus-error";

describe("focusErrorMessage", () => {
  it("reads a public Tauri error instead of rendering an object string", () => {
    const error = {
      code: "DASHBOARD_CONFLICT",
      message: "首页数据已发生变化，请重新读取。",
    };

    expect(focusErrorMessage(error, "操作失败，请重试")).toBe(
      "首页数据已发生变化，请重新读取。",
    );
    expect(focusErrorCode(error)).toBe("DASHBOARD_CONFLICT");
  });

  it("reads native and string errors", () => {
    expect(focusErrorMessage(new Error("保存失败"), "默认提示")).toBe("保存失败");
    expect(focusErrorMessage("连接中断", "默认提示")).toBe("连接中断");
  });

  it("falls back safely for unknown values", () => {
    expect(focusErrorMessage({}, "操作失败，请重试")).toBe("操作失败，请重试");
    expect(focusErrorCode(null)).toBeNull();
  });
});
