import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { resolveModeValue } from "@agent/lib/mode";
import { dispatchHeadlongThinker } from "@agent/lib/headlong/dispatch";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import { recordResponderResult } from "@db/services/headlong";

export const headlongRespond = defineTool({
  description:
    "Complete one Headlong responder decision. Reply directly, defer real work to the monolith, or deliberately stay silent.",
  inputSchema: z.object({
    action: z.enum(["reply", "defer", "no_reply"]),
    message: z.string().max(10_000),
    request: z.string().max(10_000),
  }),
  async execute({ action, message, request }, ctx) {
    const identity = headlongIdentity(ctx.session.auth);
    if (identity?.headlongThinker !== "responder") {
      throw new Error(
        "This tool is available only in a Headlong responder run."
      );
    }
    const event = await recordResponderResult({
      action,
      message,
      request,
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
    return {
      action,
      recorded: true,
      replyPublished: action !== "no_reply" && Boolean(message.trim()),
    };
  },
});

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeValue(context, {
        "headlong-responder": { "headlong-respond": headlongRespond },
      }),
  },
});
