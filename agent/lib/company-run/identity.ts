import type { SessionContext } from "eve/context";
import { z } from "zod";

const companyRunIdentitySchema = z.object({
  companyDispatchId: z.uuid(),
  companyName: z.string().min(1),
  originChannel: z.enum(["eve", "linq"]),
  originConversationId: z.string().min(1),
  originReplyAnchorMessageId: z.string().min(1).optional(),
  originWorkspaceId: z.string().min(1),
  task: z.string().min(1),
  workspaceId: z.string().min(1),
});

export function companyRunIdentity(auth: SessionContext["session"]["auth"]) {
  const caller =
    auth.current?.authenticator === "company-worker"
      ? auth.current
      : auth.initiator?.authenticator === "company-worker"
        ? auth.initiator
        : undefined;
  if (caller?.principalType !== "user") return undefined;
  const identity = companyRunIdentitySchema.safeParse(caller.attributes);
  return identity.success
    ? { ...identity.data, userId: caller.principalId }
    : undefined;
}
