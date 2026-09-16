import { and, eq } from "drizzle-orm";
import type { AccessScope } from "@shared/identity/access-scope";
import { agentSessions, db, workspaces } from "@db";

export async function claimSession(scope: AccessScope, sessionId: string) {
  await db
    .insert(agentSessions)
    .values({
      createdAt: new Date(),
      createdByUserId: scope.userId,
      sessionId,
      workspaceId: scope.workspaceId,
    })
    .onConflictDoNothing({ target: agentSessions.sessionId });
}

// Ownership is claimed by the session.started hook after the runtime has
// already acknowledged the session, so callers that race it wait briefly.
export async function waitForSessionOwnership(
  scope: AccessScope,
  sessionId: string
) {
  /* oxlint-disable eslint/no-await-in-loop -- Ownership visibility is checked by a bounded sequential retry loop. */
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isSessionOwned(scope, sessionId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return false;
}

export async function isSessionOwned(scope: AccessScope, sessionId: string) {
  const rows = await db
    .select({ sessionId: agentSessions.sessionId })
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.workspaceId, scope.workspaceId),
        eq(agentSessions.sessionId, sessionId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function findCompanySessionForUser(
  userId: string,
  sessionId: string
) {
  const [session] = await db
    .select({ workspaceId: agentSessions.workspaceId })
    .from(agentSessions)
    .innerJoin(workspaces, eq(workspaces.id, agentSessions.workspaceId))
    .where(
      and(
        eq(agentSessions.createdByUserId, userId),
        eq(agentSessions.sessionId, sessionId),
        eq(workspaces.kind, "company")
      )
    )
    .limit(1);
  return session;
}
