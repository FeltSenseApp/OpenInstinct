"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthSession } from "@db/services/auth/session";
import {
  appendHeadlongEvent,
  appendHeadlongMessage,
  initializeHeadlongIdentity,
  setHeadlongRetrieval,
  setHeadlongMindStatus,
} from "@db/services/headlong";
import {
  addCompanyMember,
  createCompanyWorkspace,
  resolveWorkspaceScope,
} from "@db/services/workspaces";
import { env } from "@shared/environment";
import { requestInternalRoute } from "@shared/eve/internal-request";
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
      formText(formData, "companyName")
    );
    await initializeHeadlongIdentity(scope, {
      focus: formText(formData, "focus"),
      name: formText(formData, "identityName"),
      operatorName: formText(formData, "operatorName"),
      operatorNote: formText(formData, "operatorNote"),
      vibe: formText(formData, "vibe"),
    });
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

export async function sendHeadlongMessage(formData: FormData) {
  const scope = await activeScope();
  const event = await appendHeadlongMessage(
    scope,
    formText(formData, "message")
  );
  await dispatchHeadlong({
    thinker: "responder",
    triggerEventId: event.id,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  revalidatePath("/");
}

export async function startHeadlong() {
  const scope = await activeScope();
  await setHeadlongMindStatus(scope, "active");
  const event = await appendHeadlongEvent({
    content: "manual autonomous wake",
    thinker: "system",
    type: "monolith-wake",
    workspaceId: scope.workspaceId,
  });
  await dispatchHeadlong({
    thinker: "monolith",
    triggerEventId: event.id,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  revalidatePath("/");
}

export async function setHeadlongStatus(formData: FormData) {
  const scope = await activeScope();
  const status = z.enum(["active", "paused"]).parse(formData.get("status"));
  await setHeadlongMindStatus(scope, status);
  revalidatePath("/");
}

export async function setRetrievalStatus(formData: FormData) {
  const scope = await activeScope();
  const enabled = z.enum(["true", "false"]).parse(formData.get("enabled"));
  await setHeadlongRetrieval(scope, enabled === "true");
  revalidatePath("/");
}

async function activeScope() {
  const userId = await authenticatedUserId();
  return resolveWorkspaceScope(
    userId,
    (await cookies()).get(workspaceSelectionCookie)?.value
  );
}

async function dispatchHeadlong(input: {
  thinker: "responder" | "monolith";
  triggerEventId: string;
  userId: string;
  workspaceId: string;
}) {
  const response = await requestInternalRoute("/eve/v1/headlong/dispatch", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `Headlong dispatch failed with status ${String(response.status)}.`
    );
  }
}

function formText(formData: FormData, key: string) {
  return z.string().catch("").parse(formData.get(key));
}
