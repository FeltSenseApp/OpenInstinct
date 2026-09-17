import { describe, expect, it } from "vitest";
import { computeHeadlongWake } from "./headlong";

describe("Headlong adaptive wake", () => {
  it("wakes immediately after reactive, outward, or concrete work", () => {
    expect(
      computeHeadlongWake({
        function: "idle",
        level: 6,
        reactive: true,
        ticksAtLevel: 2,
      })
    ).toEqual({
      delaySeconds: 0,
      nextLevel: 0,
      nextTicksAtLevel: 0,
    });
    expect(
      computeHeadlongWake({
        function: "act",
        level: 4,
        reactive: false,
        ticksAtLevel: 2,
      })
    ).toEqual({
      delaySeconds: 0,
      nextLevel: 0,
      nextTicksAtLevel: 0,
    });
  });

  it("dwells for three thought-only wakes and caps them at one minute", () => {
    expect(
      computeHeadlongWake({
        function: "think",
        level: 4,
        reactive: false,
        ticksAtLevel: 2,
      })
    ).toEqual({
      delaySeconds: 60,
      nextLevel: 5,
      nextTicksAtLevel: 0,
    });
  });

  it("lets idle backoff reach five minutes", () => {
    expect(
      computeHeadlongWake({
        function: "idle",
        level: 7,
        reactive: false,
        ticksAtLevel: 2,
      })
    ).toEqual({
      delaySeconds: 300,
      nextLevel: 7,
      nextTicksAtLevel: 0,
    });
  });
});
