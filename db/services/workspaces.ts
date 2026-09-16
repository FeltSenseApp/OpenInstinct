import { nanoid } from "nanoid";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, user, workspaceMemberships, workspaces } from "@db";
import {
  accessScopeForUser,
  type AccessScope,
} from "@shared/identity/access-scope";
import { ensureScope } from "./scope";

export async function listWorkspacesForUser(userId: string) {
  const personalScope = accessScopeForUser(userId);
  await ensureScope(personalScope);

  return db
    .select({
      id: workspaces.id,
      kind: workspaces.kind,
      name: workspaces.name,
      role: workspaceMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(eq(workspaceMemberships.userId, userId))
    .orderBy(asc(workspaces.kind), asc(workspaces.name));
}

export async function resolveWorkspaceScope(
  userId: string,
  requestedWorkspaceId?: string
): Promise<AccessScope> {
  const personalScope = accessScopeForUser(userId);
  await ensureScope(personalScope);
  if (
    !requestedWorkspaceId ||
    requestedWorkspaceId === personalScope.workspaceId
  ) {
    return personalScope;
  }

  const [membership] = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, requestedWorkspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .limit(1);

  return membership
    ? { userId, workspaceId: membership.workspaceId }
    : personalScope;
}

export async function createCompanyWorkspace(userId: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error("Company name must be between 1 and 100 characters.");
  }

  const scope = {
    userId,
    workspaceId: `company:${nanoid(20)}`,
  } satisfies AccessScope;
  const createdAt = new Date();
  await db.transaction(async (transaction) => {
    await transaction.insert(workspaces).values({
      createdAt,
      id: scope.workspaceId,
      kind: "company",
      name: normalizedName,
    });
    await transaction.insert(workspaceMemberships).values({
      createdAt,
      role: "owner",
      userId,
      workspaceId: scope.workspaceId,
    });
  });
  return scope;
}

export async function addCompanyMember(ownerScope: AccessScope, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Enter a member email address.");

  const [ownerWorkspace, account] = await Promise.all([
    db
      .select({ id: workspaces.id })
      .from(workspaceMemberships)
      .innerJoin(
        workspaces,
        eq(workspaces.id, workspaceMemberships.workspaceId)
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, ownerScope.workspaceId),
          eq(workspaceMemberships.userId, ownerScope.userId),
          eq(workspaceMemberships.role, "owner"),
          eq(workspaces.kind, "company")
        )
      )
      .limit(1),
    db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .limit(1),
  ]);

  if (!ownerWorkspace[0])
    throw new Error("Only company owners can add members.");
  if (!account[0])
    throw new Error("That user must sign in before being added.");

  await db
    .insert(workspaceMemberships)
    .values({
      role: "member",
      userId: `better-auth:${account[0].id}`,
      workspaceId: ownerScope.workspaceId,
    })
    .onConflictDoNothing({
      target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    });
}

export async function listCompanyMembers(scope: AccessScope) {
  const [membership] = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, scope.workspaceId),
        eq(workspaceMemberships.userId, scope.userId),
        eq(workspaces.kind, "company")
      )
    )
    .limit(1);
  if (!membership) return undefined;

  const members = await db
    .select({
      email: user.email,
      name: user.name,
      role: workspaceMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(
      user,
      eq(workspaceMemberships.userId, sql`'better-auth:' || ${user.id}`)
    )
    .where(eq(workspaceMemberships.workspaceId, scope.workspaceId))
    .orderBy(asc(workspaceMemberships.role), asc(user.name));

  return { members, role: membership.role };
}
