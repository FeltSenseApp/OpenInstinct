import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { requireRuntimeIdentity } from "@/lib/headlong/runtime-identity";
import {
  forkTrajectory,
  getStep,
  listSteps,
  mergeTrajectory,
  searchSteps
} from "@/lib/headlong/trajectory";

const inputSchema = z.object({
  action: z.enum(["tail", "show", "search", "fork", "merge"]),
  step_id: z.string().uuid().optional(),
  trajectory_id: z.string().uuid().optional(),
  query: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  content: z.string().max(30_000).optional(),
  limit: z.number().int().min(1).max(200).optional()
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
          "Inspect the append-only mind log by tail, id, or text search; fork a child trajectory; or merge a child result into its parent.",
        inputSchema,
        execute: async (input, context) => {
          const runtime = requireRuntimeIdentity(
            context.session.auth,
            "monolith"
          );
          switch (input.action) {
            case "tail":
              return listSteps(runtime.identityId, {
                limit: input.limit ?? 30,
                trajectoryId: input.trajectory_id
              });
            case "show":
              return getStep(required(input.step_id, "step_id"));
            case "search":
              return searchSteps(
                runtime.identityId,
                required(input.query, "query"),
                input.limit ?? 20
              );
            case "fork":
              return forkTrajectory({
                identityId: runtime.identityId,
                fromStepId: required(input.step_id, "step_id"),
                slug: required(input.slug, "slug")
              });
            case "merge":
              return mergeTrajectory({
                identityId: runtime.identityId,
                childTrajectoryId: required(
                  input.trajectory_id,
                  "trajectory_id"
                ),
                content: required(input.content, "content")
              });
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
