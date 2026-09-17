import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { requireRuntimeIdentity } from "@/lib/headlong/runtime-identity";
import { getStep } from "@/lib/headlong/trajectory";
import { recordResponderDecision } from "@/lib/headlong/runs";
import { requestDispatch } from "@/lib/headlong/dispatch";

const inputSchema = z.object({
  action: z.enum(["reply", "defer", "no_reply"]),
  message: z.string().max(10_000),
  request: z.string().max(10_000)
});

export default defineDynamic({
  events: {
    "turn.started": (_event, resolverContext) => {
      if (
        requireRuntimeIdentity(resolverContext.session.auth).thinker !==
        "responder"
      ) {
        return null;
      }
      return defineTool({
        description:
          "Commit the responder's single reply, defer, or no-reply decision.",
        inputSchema,
        execute: async (input, context) => {
          const runtime = requireRuntimeIdentity(
            context.session.auth,
            "responder"
          );
          const trigger = await getStep(runtime.triggerStepId);
          if (!trigger) throw new Error("Inbound message no longer exists.");
          if (input.action === "reply" && !input.message.trim()) {
            throw new Error("A reply requires a message.");
          }
          if (input.action === "defer" && !input.request.trim()) {
            throw new Error("A deferral requires a concrete request.");
          }
          if (input.action === "no_reply" && input.message.trim()) {
            throw new Error("A no-reply decision must have an empty message.");
          }
          const result = await recordResponderDecision({
            identityId: runtime.identityId,
            runId: runtime.runId,
            triggerStepId: runtime.triggerStepId,
            action: input.action,
            message: input.message,
            request: input.request,
            person: trigger.sender ?? "operator"
          });
          if (input.action === "defer" && !result.duplicate) {
            const actions = await import("@/lib/headlong/trajectory").then(
              ({ pendingDeferrals }) => pendingDeferrals(runtime.identityId)
            );
            const newest = actions.at(-1);
            if (newest) {
              await requestDispatch({
                identityId: runtime.identityId,
                thinker: "monolith",
                triggerStepId: newest.id
              });
            }
          }
          return result;
        }
      });
    }
  }
});
