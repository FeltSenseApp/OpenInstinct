"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthSession } from "@db/services/auth/session";
import {
  addCompanyMember,
  createCompanyWorkspace,
  resolveWorkspaceScope,
} from "@db/services/workspaces";
import { env } from "@shared/environment";
import { workspaceSelectionCookie } from "@shared/identity/workspace-selection";

async function authenticatedUserId() {
  const session = await getAuthSession(await headers());
  if (!session) throw new Error("Sign in to continue.");
  return `better-auth:${session.user.id}`;
}

async function selectWorkspaceCookie(workspaceId: string) {
  (await cookies()).set(workspaceSelectionCookie, workspaceId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}

export async function selectWorkspace(formData: FormData) {
  const userId = await authenticatedUserId();
  const requestedWorkspaceId = formText(formData, "workspaceId");
  const scope = await resolveWorkspaceScope(userId, requestedWorkspaceId);
  if (scope.workspaceId !== requestedWorkspaceId) {
    redirect("/?workspaceError=not-a-member");
  }
  await selectWorkspaceCookie(scope.workspaceId);
  redirect("/");
}

export async function createCompany(formData: FormData) {
  const userId = await authenticatedUserId();
  try {
    const scope = await createCompanyWorkspace(
      userId,
      formText(formData, "name")
    );
    await selectWorkspaceCookie(scope.workspaceId);
  } catch {
    redirect("/?workspaceError=invalid-company");
  }
  redirect("/");
}

export async function addMember(formData: FormData) {
  const userId = await authenticatedUserId();
  const requestedWorkspaceId = formText(formData, "workspaceId");
  const scope = await resolveWorkspaceScope(userId, requestedWorkspaceId);
  if (scope.workspaceId !== requestedWorkspaceId) {
    redirect("/?workspaceError=not-a-member");
  }
  try {
    await addCompanyMember(scope, formText(formData, "email"));
  } catch (error) {
    const code =
      error instanceof Error && error.message.includes("sign in")
        ? "unknown-user"
        : "member-not-added";
    redirect(`/?workspaceError=${code}`);
  }
  redirect("/");
}

function formText(formData: FormData, key: string) {
  return z.string().catch("").parse(formData.get(key));
}
