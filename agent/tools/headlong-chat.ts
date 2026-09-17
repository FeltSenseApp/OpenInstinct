import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { query } from "@/lib/db";
import { getIdentity } from "@/lib/headlong/identity";
import { requireRuntimeIdentity } from "@/lib/headlong/runtime-identity";
import { appendStep, getStep } from "@/lib/headlong/trajectory";

const inputSchema = z.object({
  action: z.enum(["send", "reply"]),
  to: z.string().min(1).max(200),
  message: z.string().min(1).max(30_000),
  reply_to: z.string().uuid().optional(),
  follow_up: z.boolean().optional(),
  force: z.boolean().optional()
});

export default defineDynamic({
  events: {
    "turn.started": (_event, resolverContext) => {
      if (
        requireRuntimeIdentity(resolverContext.session.auth).thinker !==
        "monolith"
      ) {
        return null;
      }
      return defineTool({
        description:
          "Send genuinely new proactive information or reply once with the result of deferred work. Exact repeats to the same person within 24 hours are refused unless force is true.",
        inputSchema,
        execute: async (input, context) => {
          const runtime = requireRuntimeIdentity(
            context.session.auth,
            "monolith"
          );
          const identity = await getIdentity(runtime.identityId);
          if (!identity) throw new Error("Identity not found.");
          if (input.action === "reply" && !input.reply_to) {
            throw new Error("A reply requires reply_to.");
          }
          if (input.reply_to) {
            const inbound = await getStep(input.reply_to);
            if (!inbound || inbound.identityId !== runtime.identityId) {
              throw new Error("Reply target not found.");
            }
          }
          if (!input.force) {
            const duplicate = await query(
              `SELECT id FROM trajectory_steps
               WHERE identity_id = $1 AND type = 'message'
                 AND sender = $2 AND recipient = $3 AND content = $4
                 AND created_at > now() - interval '24 hours'
               LIMIT 1`,
              [
                runtime.identityId,
                identity.name,
                input.to,
                input.message.trim()
              ]
            );
            if (duplicate.rows[0]) {
              throw new Error(
                "This exact message was already sent to this person in the last 24 hours."
              );
            }
          }
          const step = await appendStep({
            identityId: runtime.identityId,
            type: "message",
            source: "chat",
            content: input.message.trim(),
            sender: identity.name,
            recipient: input.to,
            replyTo: input.reply_to,
            triggerStepId: input.reply_to,
            fields: {
              followUp: input.follow_up ?? false,
              delivery: "dashboard"
            }
          });
          await appendStep({
            identityId: runtime.identityId,
            type: "delivery",
            source: "dashboard",
            content: `delivered to ${input.to}`,
            triggerStepId: step.id,
            fields: { status: "delivered", transport: "dashboard" }
          });
          return { delivered: true, stepId: step.id };
        }
      });
    }
  }
});
