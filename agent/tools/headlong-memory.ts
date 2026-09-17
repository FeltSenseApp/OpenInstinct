import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { headlongIdentity } from "@agent/lib/headlong/identity";
import { resolveModeValue } from "@agent/lib/mode";
import {
  forgetHeadlongMemory,
  searchHeadlongMemories,
  writeHeadlongMemory,
} from "@db/services/headlong";

export const headlongMemory = defineTool({
  description:
    "Manage this Headlong identity's durable text memories. Search before adding to avoid duplicates. Use goal, intention, objective, or todo for active focus; fact, belief, value, preference, or person for the corresponding durable memory. Edit by passing an existing id. Forget completed or stale memories explicitly.",
  inputSchema: z.discriminatedUnion("operation", [
    z.object({
      operation: z.literal("search"),
      query: z.string().min(1).max(500),
    }),
    z.object({
      content: z.string().min(1).max(30_000),
      expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
      id: z.string().min(1).max(100).optional(),
      kind: z.string().min(1).max(50),
      operation: z.literal("write"),
      title: z.string().min(1).max(200),
    }),
    z.object({
      id: z.string().min(1).max(100),
      operation: z.literal("forget"),
    }),
  ]),
  async execute(input, ctx) {
    const identity = headlongIdentity(ctx.session.auth);
    if (identity?.headlongThinker !== "monolith") {
      throw new Error("Only the Headlong monolith can manage memory.");
    }
    if (input.operation === "search") {
      return searchHeadlongMemories(identity.workspaceId, input.query);
    }
    if (input.operation === "forget") {
      return forgetHeadlongMemory(identity.workspaceId, input.id);
    }
    return writeHeadlongMemory({ ...input, workspaceId: identity.workspaceId });
  },
});

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeValue(context, {
        "headlong-monolith": { "headlong-memory": headlongMemory },
      }),
  },
});
