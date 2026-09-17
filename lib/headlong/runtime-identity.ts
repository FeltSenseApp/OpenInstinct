import type { SessionAuth } from "eve/context";

export interface HeadlongRuntimeIdentity {
  readonly identityId: string;
  readonly runId: string;
  readonly thinker: "monolith" | "responder";
  readonly triggerStepId: string;
}

export function runtimeIdentity(
  auth: SessionAuth
): HeadlongRuntimeIdentity | null {
  const principal = auth.current ?? auth.initiator;
  const identityId = principal?.attributes.identityId;
  const runId = principal?.attributes.runId;
  const thinker = principal?.attributes.thinker;
  const triggerStepId = principal?.attributes.triggerStepId;
  if (
    typeof identityId !== "string" ||
    typeof runId !== "string" ||
    (thinker !== "monolith" && thinker !== "responder") ||
    typeof triggerStepId !== "string"
  ) {
    return null;
  }
  return { identityId, runId, thinker, triggerStepId };
}

export function requireRuntimeIdentity(
  auth: SessionAuth,
  thinker?: "monolith" | "responder"
) {
  const identity = runtimeIdentity(auth);
  if (!identity || (thinker && identity.thinker !== thinker)) {
    throw new Error(
      thinker
        ? `This capability belongs only to the Headlong ${thinker}.`
        : "This capability belongs only to a Headlong thinker."
    );
  }
  return identity;
}
