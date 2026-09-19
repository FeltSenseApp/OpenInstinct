import { createHash } from "node:crypto";
import type { SessionAuthContext } from "eve/context";
import { z } from "zod";
import { requestInternalRoute } from "@agent/lib/internal-request";
import { listWorkspacesForUser } from "@db/services/workspaces";

export const founderAgentId = "founder";

type DispatchMetadataValue = boolean | number | string | null;
type DispatchMetadata = Readonly<Record<string, DispatchMetadataValue>>;

export interface DispatchRootSessionInput {
  readonly idempotencyKey: string;
  readonly principal: SessionAuthContext;
  readonly provenance: DispatchMetadata;
  readonly returnRoute?: DispatchMetadata;
  readonly targetAgentId: string;
  readonly targetWorkspaceId: string;
  readonly task: string;
}

const acceptedSessionSchema = z.object({
  ok: z.literal(true),
  sessionId: z.string().min(1),
  status: z.literal("accepted"),
});

const streamEventSchema = z.object({
  data: z.object({ message: z.string() }),
  type: z.literal("message.received"),
});

const internalDispatchHeader = "x-open-instinct-root-dispatch";
const internalDispatchVersion = "v1";

export async function dispatchRootSession({
  idempotencyKey,
  principal,
  provenance,
  returnRoute,
  targetAgentId,
  targetWorkspaceId,
  task,
}: DispatchRootSessionInput): Promise<{ sessionId: string }> {
  await authorizeTarget(principal, targetWorkspaceId, targetAgentId);
  const baseAttributes = {
    ...principal.attributes,
    dispatchIdempotencyKey: idempotencyKey,
    dispatchProvenance: JSON.stringify(provenance),
    targetAgentId,
    workspaceId: targetWorkspaceId,
  };
  const targetPrincipal = {
    ...principal,
    attributes: returnRoute
      ? {
          ...baseAttributes,
          dispatchReturnRoute: JSON.stringify(returnRoute),
        }
      : baseAttributes,
  } satisfies SessionAuthContext;
  const operationId = deriveOperationId({
    idempotencyKey,
    targetAgentId,
    targetWorkspaceId,
  });
  const baseDispatchContext = {
    provenance,
    targetAgentId,
    targetWorkspaceId,
    version: 1 as const,
  };
  const dispatchContext = returnRoute
    ? { ...baseDispatchContext, returnRoute }
    : baseDispatchContext;
  const serializedBody = JSON.stringify({
    clientContext: {
      dispatch: dispatchContext,
    },
    forwardedPrincipal: {
      current: targetPrincipal,
      initiator: targetPrincipal,
    },
    message: task,
    operationId,
  });

  let previousSessionId: string | undefined;
  /* oxlint-disable eslint/no-await-in-loop -- Canonical ownership requires bounded sequential retries of the same Eve operation. */
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await requestInternalRoute("/eve/v1/session", {
      body: serializedBody,
      headers: {
        "content-type": "application/json",
        [internalDispatchHeader]: internalDispatchVersion,
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `Eve rejected root-session dispatch with status ${String(response.status)}.`
      );
    }
    const { sessionId } = acceptedSessionSchema.parse(await response.json());
    if (sessionId === previousSessionId) {
      await assertCanonicalTask(sessionId, task);
      return { sessionId };
    }
    previousSessionId = sessionId;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  /* oxlint-enable eslint/no-await-in-loop */
  throw new Error("Eve did not publish the canonical root session in time.");
}

export function isInternalRootDispatch(request: Request) {
  return (
    request.headers.get(internalDispatchHeader) === internalDispatchVersion
  );
}

export function deriveOperationId(input: {
  readonly idempotencyKey: string;
  readonly targetAgentId: string;
  readonly targetWorkspaceId: string;
}) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "open-instinct:dispatch-root-session:v1",
        input.idempotencyKey,
        input.targetWorkspaceId,
        input.targetAgentId,
      ])
    )
    .digest("hex");
  return `dispatch:v1:${digest}`;
}

async function authorizeTarget(
  principal: SessionAuthContext,
  targetWorkspaceId: string,
  targetAgentId: string
) {
  if (principal.principalType !== "user") {
    throw new Error("Root dispatch requires an authenticated user principal.");
  }
  if (targetAgentId !== founderAgentId) {
    throw new Error("The target is not an available top-level agent.");
  }
  const workspaces = await listWorkspacesForUser(principal.principalId);
  if (!workspaces.some((workspace) => workspace.id === targetWorkspaceId)) {
    throw new Error("The principal cannot access the target workspace.");
  }
}

async function assertCanonicalTask(sessionId: string, expectedTask: string) {
  const response = await requestInternalRoute(
    `/eve/v1/session/${encodeURIComponent(sessionId)}/stream?startIndex=0`,
    {
      headers: { [internalDispatchHeader]: internalDispatchVersion },
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok || !response.body) {
    throw new Error("The canonical Eve session could not be inspected.");
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  try {
    /* oxlint-disable eslint/no-await-in-loop -- The stream must be consumed in order through the first accepted message. */
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += value;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = streamEventSchema.safeParse(JSON.parse(line));
        if (!event.success) continue;
        if (event.data.data.message !== expectedTask) {
          throw new Error(
            "The idempotency key already belongs to a different root-session task."
          );
        }
        return;
      }
    }
    /* oxlint-enable eslint/no-await-in-loop */
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  throw new Error("The canonical Eve session has no accepted initial task.");
}
