import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import {
  addMemory,
  editMemory,
  forgetMemory,
  listMemories,
  searchMemories
} from "@/lib/headlong/memory";
import { getRootTrajectory } from "@/lib/headlong/identity";
import { requireRuntimeIdentity } from "@/lib/headlong/runtime-identity";

const inputSchema = z.object({
  action: z.enum(["search", "list", "add", "edit", "forget"]),
  query: z.string().optional(),
  memory_id: z.string().uuid().optional(),
  type: z.string().min(1).max(80).optional(),
  summary: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(30_000).optional(),
  expires_at: z.iso.datetime().nullable().optional()
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
          "Search, list, add, edit, or forget arbitrary typed Headlong memories. Goals, todos, values, beliefs, facts, intentions, preferences, people, and custom types all live here.",
        inputSchema,
        execute: async (input, context) => {
          const runtime = requireRuntimeIdentity(
            context.session.auth,
            "monolith"
          );
          switch (input.action) {
            case "search":
              return searchMemories(
                runtime.identityId,
                required(input.query, "query"),
                20
              );
            case "list":
              return listMemories(runtime.identityId, { type: input.type });
            case "add": {
              const trajectory = await getRootTrajectory(runtime.identityId);
              return addMemory({
                identityId: runtime.identityId,
                type: required(input.type, "type"),
                summary: required(input.summary, "summary"),
                body: required(input.body, "body"),
                sourceTrajectoryId: trajectory.id,
                sourceStepIds: [runtime.triggerStepId],
                expiresAt: input.expires_at
                  ? new Date(input.expires_at)
                  : undefined
              });
            }
            case "edit":
              return editMemory(
                runtime.identityId,
                required(input.memory_id, "memory_id"),
                {
                  type: input.type,
                  summary: input.summary,
                  body: input.body,
                  expiresAt:
                    input.expires_at === undefined
                      ? undefined
                      : input.expires_at
                        ? new Date(input.expires_at)
                        : null
                }
              );
            case "forget":
              return {
                forgotten: await forgetMemory(
                  runtime.identityId,
                  required(input.memory_id, "memory_id")
                )
              };
          }
        }
      });
    }
  }
});

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined || value === "") {
    throw new Error(`${field} is required for this action.`);
  }
  return value;
}
