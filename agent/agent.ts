import { defineAgent, defineDynamic } from "eve";
import { runtimeIdentity } from "@/lib/headlong/runtime-identity";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      "session.started": (_event, ctx) => {
        const identity = runtimeIdentity(ctx.session.auth);
        return identity?.thinker === "responder"
          ? process.env.HEADLONG_REPLY_MODEL ??
              "anthropic/claude-sonnet-4.6"
          : process.env.HEADLONG_MODEL ?? "anthropic/claude-opus-4.8";
      }
    }
  }),
  reasoning: "medium",
  compaction: {
    thresholdPercent: 0.72
  },
  limits: {
    sessionTimeoutMs: false
  }
});
