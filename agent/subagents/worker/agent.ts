import { defineAgent, defineDynamic } from "eve";
import { runtimeIdentity } from "@/lib/headlong/runtime-identity";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      if (runtimeIdentity(ctx.session.auth)?.thinker !== "monolith") {
        return null;
      }
      return defineAgent({
        description:
          "Carry out one bounded piece of work for the persistent Headlong mind and return concise evidence. You may not invent additional objectives.",
        model: process.env.HEADLONG_MODEL ?? "anthropic/claude-opus-4.8",
        reasoning: "medium"
      });
    }
  }
});
