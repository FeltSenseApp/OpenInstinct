import { defineHook } from "eve/hooks";
import { query } from "@/lib/db";
import { failRun } from "@/lib/headlong/runs";
import { runtimeIdentity } from "@/lib/headlong/runtime-identity";

export default defineHook({
  events: {
    async "*"(event, context) {
      const runtime = runtimeIdentity(context.session.auth);
      await query(
        `INSERT INTO runtime_events
          (id, identity_id, session_id, type, data, emitted_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          event.meta.id,
          runtime?.identityId ?? null,
          context.session.id,
          event.type,
          "data" in event ? JSON.stringify(event.data) : null,
          event.meta.at
        ]
      ).catch(() => undefined);
    },
    async "message.completed"(event, context) {
      const runtime = runtimeIdentity(context.session.auth);
      if (
        !runtime ||
        event.data.finishReason === "tool-calls"
      ) {
        return;
      }
      await failRun(
        runtime.runId,
        `The ${runtime.thinker} stopped without committing its required Headlong decision.`
      );
    },
    async "turn.failed"(event, context) {
      const runtime = runtimeIdentity(context.session.auth);
      if (runtime) await failRun(runtime.runId, event.data.message);
    }
  }
});
