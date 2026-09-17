import { describe, expect, it } from "vitest";
import { runtimeIdentity } from "./runtime-identity";

describe("runtimeIdentity", () => {
  it("reads the authenticated Headlong runtime envelope", () => {
    expect(
      runtimeIdentity({
        current: {
          attributes: {
            identityId: "identity",
            runId: "run",
            thinker: "monolith",
            triggerStepId: "trigger"
          },
          authenticator: "test",
          principalId: "identity",
          principalType: "service"
        },
        initiator: null
      })
    ).toEqual({
      identityId: "identity",
      runId: "run",
      thinker: "monolith",
      triggerStepId: "trigger"
    });
  });

  it("rejects unrelated principals", () => {
    expect(runtimeIdentity({ current: null, initiator: null })).toBeNull();
  });
});
