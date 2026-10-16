import { createMaterial, filterMaterials, restoreMaterial, trashMaterial, updateMaterial } from "./materials";

describe("learning materials", () => {
  const base = createMaterial({
    title: "英语作文模板",
    subject: "英语",
    kind: "作文",
    mastery: 2,
    favorite: true,
  }, new Date("2026-10-15T08:00:00Z"));

  it("validates and normalizes fields", () => {
    expect(base.title).toBe("英语作文模板");
    expect(() => createMaterial({ ...base, title: " ", mastery: 9 as 1 })).toThrow();
  });

  it("filters by search, subject, favorite and trash state", () => {
    const math = createMaterial({ title: "极限错题", subject: "数学", kind: "错题", mastery: 1, favorite: false });
    expect(filterMaterials([base, math], { query: "作文", subject: "全部", favoriteOnly: true, mode: "active" })).toEqual([base]);
    expect(filterMaterials([trashMaterial([base], base.id)[0]], { query: "", subject: "全部", favoriteOnly: false, mode: "trash" })).toHaveLength(1);
  });

  it("trashes, restores and rejects stale updates", () => {
    const trashed = trashMaterial([base], base.id)[0];
    expect(restoreMaterial([trashed], base.id)[0].deletedAt).toBeNull();
    expect(() => updateMaterial([base], base.id, 0, { title: "旧页面覆盖" })).toThrow("资料已在其他位置更新");
  });
});
