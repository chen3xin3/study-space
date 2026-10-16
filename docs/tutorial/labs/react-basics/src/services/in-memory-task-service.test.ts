import { describe, expect, it } from "vitest";
import { InMemoryTaskService } from "./in-memory-task-service";

describe("InMemoryTaskService", () => {
  it("列出克隆数据，外部修改不会污染服务内部状态", async () => {
    const service = new InMemoryTaskService({ delay: 0 });
    const first = await service.list();
    first[0]!.title = "被外部修改";

    const second = await service.list();
    expect(second[0]?.title).not.toBe("被外部修改");
  });

  it("创建任务并返回新记录", async () => {
    const service = new InMemoryTaskService({ delay: 0, initialTasks: [] });
    const task = await service.create({ title: "  整理框架  ", subject: "政治" });

    expect(task).toMatchObject({
      title: "整理框架",
      subject: "政治",
      completed: false,
    });
    expect(await service.list()).toHaveLength(1);
  });

  it("切换任务并拒绝未知 id", async () => {
    const service = new InMemoryTaskService({ delay: 0 });
    const [task] = await service.list();

    const changed = await service.toggle(task!.id);
    expect(changed.completed).toBe(!task!.completed);
    await expect(service.toggle("missing")).rejects.toThrow("任务不存在");
  });
});
