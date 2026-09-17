import { describe, expect, it } from "vitest";
import { computeHeadlongWake } from "./headlong";

describe("Headlong adaptive wake", () => {
  it("wakes immediately after outward or concrete work", () => {
    expect(computeHeadlongWake(80, "action")).toEqual({
      delaySeconds: 0,
      nextBackoff: 5,
    });
    expect(computeHeadlongWake(40, "share")).toEqual({
      delaySeconds: 0,
      nextBackoff: 5,
    });
  });

  it("caps thought-only backoff at one minute", () => {
    expect(computeHeadlongWake(40, "think")).toEqual({
      delaySeconds: 40,
      nextBackoff: 60,
    });
    expect(computeHeadlongWake(60, "learn").nextBackoff).toBe(60);
  });

  it("lets idle backoff reach five minutes", () => {
    expect(computeHeadlongWake(160, "idle")).toEqual({
      delaySeconds: 160,
      nextBackoff: 300,
    });
    expect(computeHeadlongWake(300, "idle").nextBackoff).toBe(300);
  });
});
