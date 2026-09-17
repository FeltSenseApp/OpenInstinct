import type { SessionContext } from "eve/context";
import { z } from "zod";

const schema = z.object({
  headlongRunId: z.string().min(1),
  headlongThinker: z.enum(["responder", "monolith"]),
  headlongTriggerEventId: z.string().min(1),
  workspaceId: z.string().min(1),
});

export function headlongIdentity(auth: SessionContext["session"]["auth"]) {
  const principal = auth.current ?? auth.initiator;
  if (principal?.principalType !== "user") return undefined;
  const parsed = schema.safeParse(principal.attributes);
  return parsed.success
    ? { ...parsed.data, userId: principal.principalId }
    : undefined;
}
