import { defineTool } from "eve/tools";
import { z } from "zod";
import { dispatchHeadlongThinker } from "@agent/lib/headlong/dispatch";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import { recordResponderResult } from "@db/services/headlong";

export default defineTool({
  description:
    "Complete a Headlong responder wake with an optional outward reply and an observation for the monolith.",
  inputSchema: z.object({
    observation: z.string().min(1).max(10_000),
    reply: z.string().min(1).max(10_000).nullable(),
  }),
  async execute({ observation, reply }, ctx) {
    const identity = headlongIdentity(ctx.session.auth);
    if (identity?.headlongThinker !== "responder") {
      throw new Error(
        "This tool is available only in a Headlong responder run."
      );
    }
    const event = await recordResponderResult({
      observation,
      reply,
      runId: identity.headlongRunId,
      sessionId: ctx.session.id,
      triggerEventId: identity.headlongTriggerEventId,
      workspaceId: identity.workspaceId,
    });
    await dispatchHeadlongThinker({
      scope: { userId: identity.userId, workspaceId: identity.workspaceId },
      thinker: "monolith",
      triggerEventId: event.id,
    });
    return { recorded: true, replyPublished: reply !== null };
  },
});
