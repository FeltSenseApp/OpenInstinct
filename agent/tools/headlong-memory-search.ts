import { defineTool } from "eve/tools";
import { z } from "zod";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import { searchHeadlongMemories } from "@db/services/headlong";

export default defineTool({
  description:
    "Search the current company's durable Headlong memories and goals.",
  inputSchema: z.object({ query: z.string().min(1).max(500) }),
  async execute({ query }, ctx) {
    const identity = headlongIdentity(ctx.session.auth);
    if (!identity) throw new Error("This tool requires a Headlong run.");
    return searchHeadlongMemories(identity.workspaceId, query);
  },
});
