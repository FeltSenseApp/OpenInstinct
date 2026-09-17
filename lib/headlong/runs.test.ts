import { describe, expect, it } from "vitest";
import { nextPacing } from "./runs";

describe("Headlong adaptive pacing", () => {
  it("dwells for three wakes before increasing the level", () => {
    let state = { currentLevel: 0, currentTicks: 0 };
    const delays: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const next = nextPacing({ ...state, fn: "think" });
      delays.push(next.delaySeconds);
      state = {
        currentLevel: next.nextLevel,
        currentTicks: next.nextTicks
      };
    }
    expect(delays).toEqual([5, 5, 5, 10]);
  });

  it("uses the longer idle ladder and caps at five minutes", () => {
    expect(
      nextPacing({ currentLevel: 99, currentTicks: 2, fn: "idle" })
    ).toEqual({ delaySeconds: 300, nextLevel: 6, nextTicks: 0 });
  });

  it("resets immediately after outwardly visible work", () => {
    expect(
      nextPacing({ currentLevel: 5, currentTicks: 2, fn: "share" })
    ).toEqual({ delaySeconds: 5, nextLevel: 0, nextTicks: 0 });
  });
});
