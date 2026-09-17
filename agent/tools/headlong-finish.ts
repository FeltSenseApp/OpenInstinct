import type { WorkflowToolContext } from "eve/tools";
import { defineWorkflowTool } from "eve/tools";
import { sleep } from "workflow";
import { z } from "zod";
import { appendStep } from "@/lib/headlong/trajectory";
import { finishMonolithRun } from "@/lib/headlong/runs";
import { requireRuntimeIdentity } from "@/lib/headlong/runtime-identity";
import { requestDispatch } from "@/lib/headlong/dispatch";

const inputSchema = z.object({
  function: z.enum([
    "act",
    "share",
    "think",
    "learn",
    "recall",
    "goals",
    "values",
    "idle"
  ]),
  content: z.string().min(1).max(30_000),
  resolves: z.string().uuid().optional()
});

export default defineWorkflowTool({
  description:
    "Finish the monolith's one function, append its durable step, and schedule the next autonomous wake. Call exactly once at the end of a wake.",
  inputSchema,
  execution: "background",
  execute: finishWake
});

async function finishWake(
  input: z.infer<typeof inputSchema>,
  context: WorkflowToolContext
) {
  "use workflow";
  const runtime = readIdentity(context);
  const committed = await commitWake({
    ...input,
    ...runtime
  });
  await sleep(committed.delaySeconds * 1000);
  await dispatchNext({
    identityId: runtime.identityId,
    parentStepId: committed.stepId
  });
  return {
    function: input.function,
    nextWakeInSeconds: committed.delaySeconds,
    recorded: true
  };
}

function readIdentity(context: WorkflowToolContext) {
  const runtime = requireRuntimeIdentity(context.session.auth, "monolith");
  return {
    identityId: runtime.identityId,
    runId: runtime.runId,
    triggerStepId: runtime.triggerStepId
  };
}

async function commitWake(input: {
  identityId: string;
  runId: string;
  triggerStepId: string;
  function: z.infer<typeof inputSchema>["function"];
  content: string;
  resolves?: string;
}) {
  "use step";
  return finishMonolithRun({
    identityId: input.identityId,
    runId: input.runId,
    triggerStepId: input.triggerStepId,
    fn: input.function,
    content: input.content,
    resolves: input.resolves
  });
}

async function dispatchNext(input: {
  identityId: string;
  parentStepId: string;
}) {
  "use step";
  const wake = await appendStep({
    identityId: input.identityId,
    type: "monolith-wake",
    source: "dispatcher",
    content: "scheduled autonomous wake",
    triggerStepId: input.parentStepId
  });
  return requestDispatch({
    identityId: input.identityId,
    thinker: "monolith",
    triggerStepId: wake.id
  });
}
