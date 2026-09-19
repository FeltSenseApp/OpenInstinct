import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getAuthSession } from "@db/services/auth/session";
import { resolveWorkspaceScope } from "@db/services/workspaces";
import type { AccessScope } from "@shared/identity/access-scope";
import { workspaceSelectionCookie } from "@shared/identity/workspace-selection";

export const requireRequestScope = cache(async (): Promise<AccessScope> => {
  const session = await getAuthSession(await headers());
  if (!session) throw new UnauthenticatedError();
  const requestedWorkspaceId = (await cookies()).get(
    workspaceSelectionCookie
  )?.value;
  return resolveWorkspaceScope(
    `better-auth:${session.user.id}`,
    requestedWorkspaceId
  );
});

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in to continue.");
    this.name = "UnauthenticatedError";
  }
}
