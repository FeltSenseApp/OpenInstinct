import { defineHook } from "eve/hooks";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import { failHeadlongRun } from "@db/services/headlong";

export default defineHook({
  events: {
    async "message.completed"(event, ctx) {
      const identity = headlongIdentity(ctx.session.auth);
      if (
        identity?.headlongThinker !== "responder" ||
        event.data.finishReason !== "stop"
      )
        return;
      await fail(
        identity,
        ctx.session.id,
        "The thinker stopped without committing its required Headlong function."
      );
    },
    async "turn.failed"(event, ctx) {
      const identity = headlongIdentity(ctx.session.auth);
      if (!identity) return;
      await fail(identity, ctx.session.id, event.data.message);
    },
  },
});

function fail(
  identity: NonNullable<ReturnType<typeof headlongIdentity>>,
  sessionId: string,
  error: string
) {
  return failHeadlongRun({
    error,
    runId: identity.headlongRunId,
    sessionId,
    triggerEventId: identity.headlongTriggerEventId,
    workspaceId: identity.workspaceId,
  });
}
