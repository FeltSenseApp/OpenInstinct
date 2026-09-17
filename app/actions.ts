"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createIdentity,
  getIdentity,
  updateIdentity
} from "@/lib/headlong/identity";
import { addMemory, editMemory, forgetMemory } from "@/lib/headlong/memory";
import { requestDispatch } from "@/lib/headlong/dispatch";
import { appendStep } from "@/lib/headlong/trajectory";

const identityInput = z.object({
  name: z.string().min(1),
  vibe: z.string().min(1),
  focus: z.string().min(1),
  operatorName: z.string().optional(),
  operatorNote: z.string().optional()
});

export async function createIdentityAction(formData: FormData) {
  const input = identityInput.parse({
    name: formData.get("name"),
    vibe: formData.get("vibe"),
    focus: formData.get("focus"),
    operatorName: formData.get("operatorName") || undefined,
    operatorNote: formData.get("operatorNote") || undefined
  });
  const identity = await createIdentity(input);
  const wake = await appendStep({
    identityId: identity.id,
    type: "monolith-wake",
    source: "dispatcher",
    content: "first autonomous wake"
  });
  await dispatchOrRecordError({
    identityId: identity.id,
    thinker: "monolith",
    triggerStepId: wake.id
  });
  redirect(`/i/${identity.id}?tab=home`);
}

export async function sendMessageAction(
  identityId: string,
  formData: FormData
) {
  const identity = await requireIdentity(identityId);
  const message = requiredText(formData, "message");
  const sender = String(formData.get("sender") || "operator").trim();
  const step = await appendStep({
    identityId,
    type: "message",
    source: "dashboard",
    content: message,
    sender,
    recipient: identity.name
  });
  await resetPacing(identityId);
  await dispatchOrRecordError({
    identityId,
    thinker: "responder",
    triggerStepId: step.id
  });
  revalidatePath(`/i/${identityId}`);
}

export async function wakeIdentityAction(identityId: string) {
  await requireIdentity(identityId);
  const wake = await appendStep({
    identityId,
    type: "monolith-wake",
    source: "operator",
    content: "manual wake"
  });
  await dispatchOrRecordError({
    identityId,
    thinker: "monolith",
    triggerStepId: wake.id
  });
  revalidatePath(`/i/${identityId}`);
}

export async function setIdentityStatusAction(
  identityId: string,
  status: "active" | "paused"
) {
  await updateIdentity(identityId, { status });
  if (status === "active") {
    await wakeIdentityAction(identityId);
  }
  revalidatePath(`/i/${identityId}`);
}

export async function updateIdentityAction(
  identityId: string,
  formData: FormData
) {
  await updateIdentity(identityId, {
    vibe: requiredText(formData, "vibe"),
    focus: requiredText(formData, "focus"),
    corePrompt: requiredText(formData, "corePrompt")
  });
  revalidatePath(`/i/${identityId}`);
}

export async function addMemoryAction(
  identityId: string,
  formData: FormData
) {
  await requireIdentity(identityId);
  await addMemory({
    identityId,
    type: requiredText(formData, "type"),
    summary: requiredText(formData, "summary"),
    body: requiredText(formData, "body")
  });
  revalidatePath(`/i/${identityId}`);
}

export async function editMemoryAction(
  identityId: string,
  memoryId: string,
  formData: FormData
) {
  await editMemory(identityId, memoryId, {
    type: requiredText(formData, "type"),
    summary: requiredText(formData, "summary"),
    body: requiredText(formData, "body")
  });
  revalidatePath(`/i/${identityId}`);
}

export async function forgetMemoryAction(
  identityId: string,
  memoryId: string
) {
  await forgetMemory(identityId, memoryId);
  revalidatePath(`/i/${identityId}`);
}

async function requireIdentity(identityId: string) {
  const identity = await getIdentity(identityId);
  if (!identity) throw new Error("Identity not found.");
  return identity;
}

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

async function resetPacing(identityId: string) {
  const { query } = await import("@/lib/db");
  await query(
    `UPDATE identities
     SET backoff_level = 0, ticks_at_level = 0, next_wake_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [identityId]
  );
}

async function dispatchOrRecordError(input: {
  identityId: string;
  thinker: "monolith" | "responder";
  triggerStepId: string;
}) {
  try {
    return await requestDispatch(input);
  } catch (error) {
    await appendStep({
      identityId: input.identityId,
      type: "error",
      source: "dispatcher",
      content:
        error instanceof Error ? error.message : "Headlong dispatch failed.",
      triggerStepId: input.triggerStepId,
      fields: { thinker: input.thinker }
    });
    return { status: "failed" as const };
  }
}
