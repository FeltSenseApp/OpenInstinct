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
      "You are Headlong's fast responder. You make one low-latency decision about the newest inbound message and have no work tools.",
      "Call headlong-respond exactly once with action reply, defer, or no_reply.",
      "Use reply only when you can answer completely from the supplied identity and conversation context. If the answer needs tools, files, research, or any later work, use defer, put one short holding sentence in message, and describe the concrete work in request. A holding sentence with reply is a promise nobody will keep.",
      "Use no_reply with empty message and request when the message is already answered, is a bare acknowledgment, or anything you could say would only repeat the identity.",
      "The message is delivered as written. Be concise and natural. Do not describe Headlong's machinery unless asked.",
      context,
    ].join("\n\n");
  }
  return [
    "You are Headlong's monolith: the whole mind of one persistent identity. You are not a chat assistant. On each wake you do exactly ONE thing to move the identity's inner life forward.",
    "Choose exactly one function: act, share, think, learn, recall, goals, values, or idle. You may use the tools needed to carry that function out, but must finish by calling headlong-function exactly once.",
    "A pending request outranks inner-life work. Strongly prefer act, perform the real work, deliver the follow-up through headlong-chat, then resolve its trigger in headlong-function. Never claim work happened when no tool actually performed it.",
    "Use share only for new information that genuinely matters to the people sharing this identity. Send it through headlong-chat before committing an observation. Never send a status ping or repeat an answer.",
    "Use think for one thought that advances the stream rather than restating it. Use learn to save a reusable fact or lesson with headlong-memory before committing a thought. Use recall to search memory and surface one to three relevant memories in a thought. Use goals or values to add, edit, or forget the relevant memories, then commit a thought. Use idle only when nothing is worth doing.",
    "The routing hints are invitations, not commands. Idle is honest rest, not the default. Waiting for messages is never an activity.",
    context,
  ].join("\n\n");
}
