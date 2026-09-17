import { getIdentity } from "./identity";
import { listMemories, searchMemories } from "./memory";
import { contextStaircase } from "./rollups";
import { getStep, listSteps, pendingDeferrals } from "./trajectory";

const narrativeTypes = new Set([
  "message",
  "thought",
  "observation",
  "action",
  "merge",
  "delivery",
  "error"
]);

export async function compileMonolithContext(
  identityId: string,
  triggerStepId: string
) {
  const identity = await getIdentity(identityId);
  if (!identity) throw new Error("Identity not found.");
  const [trigger, recent, pending, goals, values, life] = await Promise.all([
    getStep(triggerStepId),
    listSteps(identityId, { limit: 80 }),
    pendingDeferrals(identityId),
    listMemories(identityId, { type: "goal" }),
    listMemories(identityId, { type: "value" }),
    contextStaircase(identityId)
  ]);
  const filtered = recent.filter((step) => narrativeTypes.has(step.type));
  const tail = filtered.slice(-20);
  const related = trigger
    ? await searchMemories(identityId, trigger.content, 3)
    : [];
  const dueGoalReview =
    !identity.goalReviewAt || identity.goalReviewAt.getTime() <= Date.now();
  const shareHint =
    identity.spontaneousWakes > 0 &&
    identity.spontaneousWakes % 12 === 0;

  return [
    `<headlong identity="${identity.name}">`,
    identity.corePrompt.replaceAll("{{identity_name}}", identity.name),
    life,
    "ACTIVE GOALS:",
    goals.length
      ? goals.map((memory) => `- [${memory.id}] ${memory.body}`).join("\n")
      : "(none)",
    "VALUES:",
    values.length
      ? values.map((memory) => `- [${memory.id}] ${memory.body}`).join("\n")
      : "(none)",
    "PENDING REQUESTS:",
    pending.length
      ? pending
          .map(
            (step) =>
              `- [${step.id}] from ${step.sender ?? String(step.fields.person ?? "a person")}: ${step.content}. After doing the work, reply with headlong_chat using reply_to=${step.triggerStepId ?? step.id}, then finish with resolves=${step.id}.`
          )
          .join("\n")
      : "(none)",
    related.length
      ? `ASSOCIATIVELY RELATED MEMORIES:\n${related
          .map((memory) => `- [${memory.id}] ${memory.summary}: ${memory.body}`)
          .join("\n")}`
      : "",
    dueGoalReview ? "ROUTING SIGNAL: GOAL REVIEW is due." : "",
    shareHint
      ? "ROUTING SIGNAL: Consider whether anything genuinely new is worth sharing."
      : "",
    "RECENT STREAM:",
    tail.length
      ? tail.map(renderStep).join("\n")
      : "(the stream is quiet)",
    trigger ? `WAKE TRIGGER:\n${renderStep(trigger)}` : "",
    "</headlong>"
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function compileResponderContext(
  identityId: string,
  triggerStepId: string
) {
  const identity = await getIdentity(identityId);
  const trigger = await getStep(triggerStepId);
  if (!identity || !trigger) throw new Error("Responder context not found.");
  const recent = await listSteps(identityId, { limit: 200 });
  const person = trigger.sender ?? "operator";
  const conversation = recent
    .filter(
      (step) =>
        step.type === "message" &&
        ((step.sender === person && step.recipient === identity.name) ||
          (step.sender === identity.name && step.recipient === person) ||
          (step.source === "responder" && step.recipient === person))
    )
    .slice(-20);
  const inner = recent
    .filter((step) => step.type !== "message" && narrativeTypes.has(step.type))
    .slice(-8);
  return [
    `You are speaking as ${identity.name} to ${person}.`,
    identity.corePrompt.replaceAll("{{identity_name}}", identity.name),
    "CONVERSATION:",
    conversation.map(renderStep).join("\n"),
    "RECENT INNER LIFE:",
    inner.map(renderStep).join("\n"),
    `NEWEST MESSAGE [${trigger.id}] FROM ${person}: ${trigger.content}`
  ].join("\n\n");
}

function renderStep(step: {
  id: string;
  type: string;
  source: string;
  content: string;
  sender: string | null;
  recipient: string | null;
  createdAt: Date;
}) {
  const route =
    step.type === "message"
      ? ` ${step.sender ?? "unknown"} → ${step.recipient ?? "unknown"}`
      : "";
  return `[${step.id.slice(0, 8)} ${step.createdAt.toISOString()}] ${step.type}${route} (${step.source}): ${step.content}`;
}
