import { elapsedWorkMs, finishSession, pauseSession, recordInterruption, resumeSession, startBreak, startSession } from "./focus-clock";

describe("focus clock", () => {
  it("derives running time from timestamps and survives serialization", () => {
    const started = startSession("整理错题", 1_000);
    const restored = JSON.parse(JSON.stringify(started));
    expect(elapsedWorkMs(restored, 61_000)).toBe(60_000);
  });

  it("does not count paused or break time", () => {
    const paused = pauseSession(startSession("数学", 0), 60_000);
    expect(elapsedWorkMs(paused, 180_000)).toBe(60_000);
    const resting = startBreak(resumeSession(paused, 200_000), 260_000);
    expect(elapsedWorkMs(resting, 860_000)).toBe(120_000);
  });

  it("records interruptions and ends with a review", () => {
    const interrupted = recordInterruption(startSession("英语", 0), "查看消息", 30_000);
    const finished = finishSession(interrupted, 60_000, 4, "保持得不错");
    expect(finished.interruptions).toHaveLength(1);
    expect(finished.review).toEqual({ rating: 4, note: "保持得不错" });
  });
});
