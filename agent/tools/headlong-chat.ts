import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import { resolveModeValue } from "@agent/lib/mode";
import { appendHeadlongOutbound } from "@db/services/headlong";

export const headlongChat = defineTool({
  description:
    "Send one Headlong message from the persistent identity to the people sharing it. Use mode share for genuinely useful unsolicited information. Use follow_up only to resolve a pending request and pass that request's trigger step as replyTo. Delivery is recorded on the single trajectory.",
  inputSchema: z.object({
    content: z.string().min(1).max(20_000),
    mode: z.enum(["share", "follow_up"]),
    replyTo: z.string().min(1).max(100).optional(),
  }),
  async execute(input, ctx) {
    const identity = headlongIdentity(ctx.session.auth);
    if (identity?.headlongThinker !== "monolith") {
      throw new Error("Only the Headlong monolith can initiate a message.");
    }
    if (input.mode === "follow_up" && !input.replyTo) {
      throw new Error("A follow-up requires the pending request trigger step.");
    }
    const event = await appendHeadlongOutbound({
      content: input.content,
      replyTo: input.replyTo,
      runId: identity.headlongRunId,
      sessionId: ctx.session.id,
      workspaceId: identity.workspaceId,
    });
    return { delivered: true, stepId: event.id };
  },
});

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeValue(context, {
        "headlong-monolith": { "headlong-chat": headlongChat },
      }),
  },
});
