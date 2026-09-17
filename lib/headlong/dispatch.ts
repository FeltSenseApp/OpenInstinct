import type { SessionAuthContext } from "eve/context";
import { getIdentity } from "./identity";
import { compileMonolithContext, compileResponderContext } from "./context";
import { claimRun, failRun, markRunRunning } from "./runs";
import type { Thinker } from "./types";
import { internalRequest } from "./internal-request";

export async function requestDispatch(input: {
  identityId: string;
  thinker: Exclude<Thinker, "recap">;
  triggerStepId: string;
}) {
  const response = await internalRequest("/headlong/internal/dispatch", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(
      `Headlong dispatch failed with status ${String(response.status)}: ${await response.text()}`
    );
  }
  return response.json() as Promise<{
    sessionId?: string;
    status: "started" | "duplicate" | "paused";
  }>;
}

export async function prepareDispatch(input: {
  identityId: string;
  thinker: "monolith" | "responder";
  triggerStepId: string;
}) {
  const identity = await getIdentity(input.identityId);
  if (!identity) throw new Error("Identity not found.");
  if (identity.status !== "active") return { status: "paused" as const };
  const run = await claimRun(input);
  if (!run) return { status: "duplicate" as const };
  try {
    const context =
      input.thinker === "monolith"
        ? await compileMonolithContext(
            input.identityId,
            input.triggerStepId
          )
        : await compileResponderContext(
            input.identityId,
            input.triggerStepId
          );
    const principal = {
      authenticator: `headlong-${input.thinker}`,
      issuer: "headlong-on-eve",
      principalType: "service" as const,
      principalId: input.identityId,
      attributes: {
        identityId: input.identityId,
        runId: String(run.id),
        thinker: input.thinker,
        triggerStepId: input.triggerStepId
      }
    } satisfies SessionAuthContext;
    return {
      context,
      identity,
      principal,
      runId: String(run.id),
      status: "ready" as const
    };
  } catch (error) {
    await failRun(
      String(run.id),
      error instanceof Error ? error.message : "Dispatch preparation failed."
    );
    throw error;
  }
}

export { markRunRunning };
