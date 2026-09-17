import type { WorkflowToolContext } from "eve/tools";
import { defineWorkflowTool } from "eve/tools";
import { sleep } from "workflow";
import { z } from "zod";
import { dispatchHeadlongThinker } from "@agent/lib/headlong/dispatch";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import {
  appendHeadlongEvent,
  recordMonolithResult,
  type HeadlongFunction,
} from "@db/services/headlong";

const headlongFunctionInput = z.object({
  content: z.string().min(1).max(30_000),
  function: z.enum([
    "act",
    "share",
    "think",
    "learn",
    "recall",
    "goals",
    "values",
    "idle",
  ]),
  resolves: z.string().min(1).max(100).optional(),
});

export default defineWorkflowTool({
  description:
    "Finish exactly one Headlong monolith function by appending its durable thought, observation, or idle step and scheduling the next wake. Use the memory tools before this call when learning or tending goals and values.",
  inputSchema: headlongFunctionInput,
  execution: "background",
  execute: executeHeadlongFunction,
});

async function executeHeadlongFunction(
  input: z.infer<typeof headlongFunctionInput>,
  ctx: WorkflowToolContext
) {
  "use workflow";
  const identity = readMonolithIdentity(ctx);
  const committed = await commitFunction({
    content: input.content,
    fn: input.function,
    resolves: input.resolves,
    runId: identity.runId,
    sessionId: identity.sessionId,
    triggerEventId: identity.triggerEventId,
    userId: identity.userId,
    workspaceId: identity.workspaceId,
  });
  if (committed.delaySeconds > 0) {
    await sleep(`${String(committed.delaySeconds)}s`);
  }
  await startNextWake({
    eventId: committed.eventId,
    userId: identity.userId,
    workspaceId: identity.workspaceId,
  });
  return {
    function: input.function,
    nextWakeInSeconds: committed.delaySeconds,
    recorded: true,
  };
}

function readMonolithIdentity(ctx: WorkflowToolContext) {
  const identity = headlongIdentity(ctx.session.auth);
  if (identity?.headlongThinker !== "monolith") {
    throw new Error("This tool is available only in a Headlong monolith run.");
  }
  return {
    runId: identity.headlongRunId,
    sessionId: ctx.session.id,
    triggerEventId: identity.headlongTriggerEventId,
    userId: identity.userId,
    workspaceId: identity.workspaceId,
  };
}

async function commitFunction(input: {
  content: string;
  fn: HeadlongFunction;
  resolves?: string;
  runId: string;
  sessionId: string;
  triggerEventId: string;
  userId: string;
  workspaceId: string;
}) {
  "use step";
  const result = await recordMonolithResult(input);
  return { delaySeconds: result.delaySeconds, eventId: result.event.id };
}

async function startNextWake(input: {
  eventId: string;
  userId: string;
  workspaceId: string;
}) {
  "use step";
  const wake = await appendHeadlongEvent({
    content: "scheduled autonomous wake",
    parentId: input.eventId,
    thinker: "system",
    type: "monolith-wake",
    workspaceId: input.workspaceId,
  });
  return dispatchHeadlongThinker({
    scope: { userId: input.userId, workspaceId: input.workspaceId },
    thinker: "monolith",
    triggerEventId: wake.id,
  });
}
