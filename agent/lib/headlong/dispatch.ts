import type { SessionAuthContext } from "eve/context";
import {
  appendHeadlongEvent,
  claimHeadlongRun,
  compileHeadlongContext,
  ensureHeadlongMind,
  finishHeadlongRun,
  markHeadlongRunRunning,
  type HeadlongThinker,
} from "@db/services/headlong";
import type { AccessScope } from "@shared/identity/access-scope";
import {
  dispatchRootSession,
  founderAgentId,
} from "@agent/lib/eve/dispatch-root-session";

export async function dispatchHeadlongThinker(input: {
  scope: AccessScope;
  thinker: HeadlongThinker;
  triggerEventId: string;
}) {
  const mind = await ensureHeadlongMind(input.scope);
  if (mind.status !== "active") return { status: "paused" as const };
  const run = await claimHeadlongRun({
    thinker: input.thinker,
    triggerEventId: input.triggerEventId,
    workspaceId: input.scope.workspaceId,
  });
  if (!run) return { status: "duplicate" as const };

  try {
    const context = await compileHeadlongContext(
      input.scope.workspaceId,
      input.triggerEventId,
      input.thinker
    );
    const principal = {
      attributes: {
        headlongRunId: run.id,
        headlongThinker: input.thinker,
        headlongTriggerEventId: input.triggerEventId,
        workspaceId: input.scope.workspaceId,
      },
      authenticator: `headlong-${input.thinker}`,
      issuer: "open-instinct",
      principalId: input.scope.userId,
      principalType: "user" as const,
    } satisfies SessionAuthContext;
    const { sessionId } = await dispatchRootSession({
      idempotencyKey: `headlong:${run.id}`,
      principal,
      provenance: {
        headlongRunId: run.id,
        thinker: input.thinker,
        triggerEventId: input.triggerEventId,
      },
      targetAgentId: founderAgentId,
      targetWorkspaceId: input.scope.workspaceId,
      task: thinkerPrompt(input.thinker, context),
    });
    await markHeadlongRunRunning(run.id, sessionId);
    return { runId: run.id, sessionId, status: "started" as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown dispatch failure";
    await finishHeadlongRun(run.id, "failed", message);
    await appendHeadlongEvent({
      content: message,
      metadata: { runId: run.id },
      parentId: input.triggerEventId,
      thinker: "system",
      type: "error",
      workspaceId: input.scope.workspaceId,
    });
    throw error;
  }
}

function thinkerPrompt(thinker: HeadlongThinker, context: string) {
  if (thinker === "responder") {
    return [
      "You are Headlong's fast responder. Inspect the new company message and context.",
      "Call headlong-respond exactly once. Reply when useful; use null only when silence is clearly better. Record a crisp observation for the monolith, including any promise or work implied by the reply.",
      context,
    ].join("\n\n");
  }
  return [
    "You are Headlong's monolith: the company's slow, continuous executive mind.",
    "Choose exactly one function for this wake and call headlong-function exactly once: action, share, think, learn, recall, goals, values, or idle.",
    "The cadence tag is advisory: when share-hint is true, actively consider sharing useful progress; when goal-review-due is true, prefer reviewing goals unless current work is more urgent.",
    "Use action for concrete work, share for a proactive company message, and the memory payload to persist or revise a memory, goal, todo, person, or company fact. Do not merely narrate an action as completed.",
    context,
  ].join("\n\n");
}
