import type { WorkflowToolContext } from "eve/tools";
import { defineWorkflowTool } from "eve/tools";
import { sleep } from "workflow";
import { z } from "zod";
import { dispatchHeadlongThinker } from "@agent/lib/headlong/dispatch";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import {
  recordMonolithResult,
  type HeadlongFunction,
} from "@db/services/headlong";

const memorySchema = z.object({
  content: z.string().min(1).max(30_000),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  id: z.string().min(1).max(100).optional(),
  kind: z.enum(["memory", "goal", "todo", "person", "company"]),
  title: z.string().min(1).max(200),
});

export default defineWorkflowTool({
  description:
    "Commit exactly one Headlong monolith function and durably schedule the company's next autonomous wake.",
  inputSchema: z.object({
    content: z.string().min(1).max(30_000),
    function: z.enum([
      "action",
      "share",
      "think",
      "learn",
      "recall",
      "goals",
      "values",
      "idle",
    ]),
    memory: memorySchema.optional(),
  }),
  execution: "background",
  async execute(input, ctx) {
    "use workflow";
    const identity = readMonolithIdentity(ctx);
    const committed = await commitFunction({
      content: input.content,
      fn: input.function,
      memory: input.memory,
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
  },
});

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
  memory?: {
    content: string;
    expiresAt?: string | null;
    id?: string;
    kind: "memory" | "goal" | "todo" | "person" | "company";
    title: string;
  };
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
  return dispatchHeadlongThinker({
    scope: { userId: input.userId, workspaceId: input.workspaceId },
    thinker: "monolith",
    triggerEventId: input.eventId,
  });
}
