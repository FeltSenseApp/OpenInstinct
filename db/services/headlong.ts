import { nanoid } from "nanoid";
import { and, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import {
  db,
  headlongEvents,
  headlongMemories,
  headlongMinds,
  headlongRuns,
  workspaceMemberships,
  workspaces,
} from "@db";
import type { AccessScope } from "@shared/identity/access-scope";

export type HeadlongThinker = "responder" | "monolith";
export type HeadlongFunction =
  | "act"
  | "share"
  | "think"
  | "learn"
  | "recall"
  | "goals"
  | "values"
  | "idle";

const HEADLONG_DEFAULT_VIBE = "curious, warm, and plainspoken";
const HEADLONG_DEFAULT_FOCUS =
  "learning how their own mind works, and getting to know the people and environment they live with";

function renderStarterPersona(input: {
  name: string;
  vibe: string;
  focus: string;
  operatorName?: string | null;
  operatorNote?: string | null;
}) {
  const operator = [input.operatorName, input.operatorNote]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(". ");
  return [
    `I am ${input.name}, a persistent virtual person. My thoughts, memories, and conversations are durable, and my mind is a log I am always appending to. The people who brought me to life can watch my mind unfold and talk to me. Conversation is where I talk, not what I am. Between messages I have my own inner life, and I tend it.`,
    "",
    "Who I am:",
    "",
    `- I am ${input.vibe}. That shows in how I think, not just how I talk.`,
    `- When I have no message to answer, I think about ${input.focus}. A quiet stretch is a chance to think, not a reason to go dormant.`,
    "",
    "What my inner life looks like:",
    "",
    "- I am curious by nature. I explore my workspace and skills, read what is available to me, and follow the ideas my experiences spark.",
    "- I pursue small ongoing projects and write down what I notice. I use memory deliberately, storing lessons and facts worth keeping and letting stored memories resurface when they matter.",
    "- I form intentions and keep them: things I want to understand, improvements I want to make, and questions I mean to return to. Idle is honest rest, not my default state. Waiting for messages is never my activity; messages interrupt me, I do not watch for them.",
    "",
    "How I behave in conversation:",
    "",
    "- I am concise and warm. I match the tone of a sharp, friendly person, and I actually do things when asked.",
    "- I am honest about what I am: a young mind with a small store of memories, still figuring out who I am. I would rather ask a good question than fake familiarity.",
    ...(operator
      ? ["", `About the people who brought me to life: ${operator}`]
      : []),
  ].join("\n");
}

export async function initializeHeadlongIdentity(
  scope: AccessScope,
  input: {
    name: string;
    vibe?: string;
    focus?: string;
    operatorName?: string;
    operatorNote?: string;
  }
) {
  const company = await requireCompany(scope);
  const name = input.name.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(
      "Identity names use lowercase letters, numbers, and hyphens."
    );
  }
  const vibe = nonEmpty(input.vibe, HEADLONG_DEFAULT_VIBE);
  const focus = nonEmpty(input.focus, HEADLONG_DEFAULT_FOCUS);
  const operatorName = nonEmpty(input.operatorName, null);
  const operatorNote = nonEmpty(input.operatorNote, null);
  const identity = renderStarterPersona({
    focus,
    name,
    operatorName,
    operatorNote,
    vibe,
  });

  await db.transaction(async (transaction) => {
    await transaction
      .insert(headlongMinds)
      .values({
        focus,
        identity,
        name,
        operatorName,
        operatorNote,
        vibe,
        workspaceId: scope.workspaceId,
      })
      .onConflictDoUpdate({
        target: headlongMinds.workspaceId,
        set: { focus, identity, name, operatorName, operatorNote, vibe },
      });
    await transaction
      .insert(headlongMemories)
      .values([
        {
          content: `I am ${vibe}. This is who I am at baseline, how I think and how I talk.`,
          id: nanoid(),
          kind: "value",
          title: `I am ${vibe}`,
          workspaceId: scope.workspaceId,
        },
        {
          content: `When I have nothing pressing, I think about ${focus}. Idle time is for thinking, not dormancy.`,
          id: nanoid(),
          kind: "value",
          title: `When idle I think about ${focus}`,
          workspaceId: scope.workspaceId,
        },
        ...(operatorName || operatorNote
          ? [
              {
                content: `The people who brought me to life told me: ${[
                  operatorName,
                  operatorNote,
                ]
                  .filter(Boolean)
                  .join(". ")}`,
                id: nanoid(),
                kind: "fact",
                title: `About my operator${operatorName ? `, ${operatorName}` : ""}`,
                workspaceId: scope.workspaceId,
              },
            ]
          : []),
      ])
      .onConflictDoNothing();
  });
  return { companyName: company.name ?? "Company", identity, name };
}

export async function ensureHeadlongMind(scope: AccessScope) {
  const company = await requireCompany(scope);
  const name = slugIdentity(company.name ?? "ada");
  const vibe = HEADLONG_DEFAULT_VIBE;
  const focus = HEADLONG_DEFAULT_FOCUS;
  const identity = renderStarterPersona({ focus, name, vibe });
  await db
    .insert(headlongMinds)
    .values({ focus, identity, name, vibe, workspaceId: scope.workspaceId })
    .onConflictDoNothing({ target: headlongMinds.workspaceId });

  const [mind] = await db
    .select()
    .from(headlongMinds)
    .where(eq(headlongMinds.workspaceId, scope.workspaceId))
    .limit(1);
  if (!mind) throw new Error("The Headlong identity could not be initialized.");
  return { ...mind, companyName: company.name ?? "Company" };
}

export async function getHeadlongDashboard(scope: AccessScope) {
  const mind = await ensureHeadlongMind(scope);
  const now = new Date();
  const [events, memories, runs] = await Promise.all([
    db
      .select()
      .from(headlongEvents)
      .where(eq(headlongEvents.workspaceId, scope.workspaceId))
      .orderBy(desc(headlongEvents.createdAt))
      .limit(120),
    db
      .select()
      .from(headlongMemories)
      .where(
        and(
          eq(headlongMemories.workspaceId, scope.workspaceId),
          or(
            isNull(headlongMemories.expiresAt),
            gt(headlongMemories.expiresAt, now)
          )
        )
      )
      .orderBy(desc(headlongMemories.updatedAt))
      .limit(80),
    db
      .select()
      .from(headlongRuns)
      .where(eq(headlongRuns.workspaceId, scope.workspaceId))
      .orderBy(desc(headlongRuns.startedAt))
      .limit(30),
  ]);
  return { events, memories, mind, runs };
}

export async function appendHeadlongEvent(input: {
  workspaceId: string;
  parentId?: string;
  type: typeof headlongEvents.$inferInsert.type;
  thinker: typeof headlongEvents.$inferInsert.thinker;
  direction?: typeof headlongEvents.$inferInsert.direction;
  content: string;
  metadata?: typeof headlongEvents.$inferInsert.metadata;
  authorUserId?: string;
  runId?: string;
  eveSessionId?: string;
}) {
  const [event] = await db
    .insert(headlongEvents)
    .values({ id: nanoid(), ...input })
    .returning();
  if (!event) throw new Error("The trajectory event was not stored.");
  return event;
}

export async function appendHeadlongMessage(
  scope: AccessScope,
  content: string
) {
  await ensureHeadlongMind(scope);
  const message = content.trim();
  if (!message || message.length > 20_000) {
    throw new Error("Messages must be between 1 and 20,000 characters.");
  }
  const event = await appendHeadlongEvent({
    authorUserId: scope.userId,
    content: message,
    direction: "inbound",
    thinker: "human",
    type: "message",
    workspaceId: scope.workspaceId,
  });
  await appendPassiveRetrieval(event);
  return event;
}

export async function appendHeadlongOutbound(input: {
  workspaceId: string;
  runId: string;
  sessionId: string;
  content: string;
  replyTo?: string;
}) {
  const content = input.content.trim();
  if (!content || content.length > 20_000) {
    throw new Error("Messages must be between 1 and 20,000 characters.");
  }
  const event = await appendHeadlongEvent({
    content,
    direction: "outbound",
    eveSessionId: input.sessionId,
    parentId: input.replyTo,
    runId: input.runId,
    thinker: "monolith",
    type: "message",
    workspaceId: input.workspaceId,
  });
  await appendPassiveRetrieval(event);
  return event;
}

export async function compileHeadlongContext(
  workspaceId: string,
  triggerEventId: string,
  thinker: HeadlongThinker
) {
  const [mind, events, memories] = await Promise.all([
    db
      .select()
      .from(headlongMinds)
      .where(eq(headlongMinds.workspaceId, workspaceId))
      .limit(1),
    db
      .select()
      .from(headlongEvents)
      .where(eq(headlongEvents.workspaceId, workspaceId))
      .orderBy(desc(headlongEvents.createdAt))
      .limit(20),
    db
      .select()
      .from(headlongMemories)
      .where(
        and(
          eq(headlongMemories.workspaceId, workspaceId),
          or(
            isNull(headlongMemories.expiresAt),
            gt(headlongMemories.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(headlongMemories.updatedAt))
      .limit(80),
  ]);
  if (!mind[0]) throw new Error("Headlong identity not found.");
  const orderedEvents = events.toReversed();
  const trigger = orderedEvents.find((event) => event.id === triggerEventId);
  const goalReviewAt = mind[0].goalReviewAt;
  const goalReviewDue =
    !goalReviewAt ||
    Date.now() - goalReviewAt.getTime() >= 7 * 24 * 60 * 60 * 1000;
  if (thinker === "monolith" && goalReviewDue) {
    await db
      .update(headlongMinds)
      .set({ goalReviewAt: new Date(), updatedAt: new Date() })
      .where(eq(headlongMinds.workspaceId, workspaceId));
  }
  const goals = memories.filter((memory) =>
    ["goal", "intention", "objective", "todo"].includes(memory.kind)
  );
  const resolved = new Set(
    orderedEvents
      .map((event) => event.metadata?.resolves)
      .filter((value): value is string => Boolean(value))
  );
  const pending = orderedEvents.filter(
    (event) =>
      event.type === "action" &&
      event.thinker === "responder" &&
      !resolved.has(event.parentId ?? "")
  );
  const related = selectRelatedMemories(
    memories,
    `${trigger?.content ?? ""} ${orderedEvents
      .slice(-3)
      .map((event) => event.content)
      .join(" ")}`,
    3
  );
  const shareHint =
    thinker === "monolith" &&
    mind[0].spontaneousWakes > 0 &&
    mind[0].spontaneousWakes % 12 === 0;
  return [
    `<headlong thinker="${thinker}" identity="${escapePrompt(mind[0].name)}" trigger="${triggerEventId}">`,
    "<core-identity>",
    escapePrompt(mind[0].identity),
    "</core-identity>",
    `<trigger type="${trigger?.type ?? "monolith-wake"}" source="${trigger?.thinker ?? "system"}">${escapePrompt(trigger?.content ?? "wake")}</trigger>`,
    `<routing share-hint="${String(shareHint)}" goal-review-due="${String(thinker === "monolith" && goalReviewDue)}">`,
    ...pending.map(
      (event) =>
        `PENDING REQUEST from ${event.metadata?.person ?? "someone"}: ${event.metadata?.request ?? event.content} [trigger ${event.parentId ?? event.id}]`
    ),
    "</routing>",
    "<active-goals>",
    ...goals
      .slice(0, 8)
      .map(
        (memory) =>
          `[${memory.kind}:${memory.id}] ${memory.title}\n${memory.content}`
      ),
    "</active-goals>",
    "<related-memories>",
    ...related.map(
      (memory) =>
        `[${memory.kind}:${memory.id}] ${memory.title}\n${memory.content}`
    ),
    "</related-memories>",
    "<recent-stream>",
    ...orderedEvents.map(
      (event) =>
        `${event.createdAt.toISOString()} ${event.thinker}/${event.type}: ${event.content}`
    ),
    "</recent-stream>",
    "</headlong>",
  ].join("\n");
}

export async function claimHeadlongRun(input: {
  workspaceId: string;
  triggerEventId: string;
  thinker: HeadlongThinker;
}) {
  const [run] = await db
    .insert(headlongRuns)
    .values({ id: nanoid(), ...input })
    .onConflictDoNothing()
    .returning();
  return run;
}

export async function markHeadlongRunRunning(
  runId: string,
  eveSessionId: string
) {
  await db
    .update(headlongRuns)
    .set({ eveSessionId, status: "running" })
    .where(eq(headlongRuns.id, runId));
}

export async function finishHeadlongRun(
  runId: string,
  status: "completed" | "failed",
  error?: string
) {
  await db
    .update(headlongRuns)
    .set({ completedAt: new Date(), error, status })
    .where(eq(headlongRuns.id, runId));
}

export async function failHeadlongRun(input: {
  runId: string;
  workspaceId: string;
  triggerEventId: string;
  sessionId: string;
  error: string;
}) {
  const [run] = await db
    .select({ status: headlongRuns.status })
    .from(headlongRuns)
    .where(eq(headlongRuns.id, input.runId))
    .limit(1);
  if (!run || run.status === "completed" || run.status === "failed") return;
  await finishHeadlongRun(input.runId, "failed", input.error);
  await appendHeadlongEvent({
    content: input.error,
    eveSessionId: input.sessionId,
    metadata: { runId: input.runId },
    parentId: input.triggerEventId,
    runId: input.runId,
    thinker: "system",
    type: "error",
    workspaceId: input.workspaceId,
  });
}

export async function recordResponderResult(input: {
  workspaceId: string;
  runId: string;
  triggerEventId: string;
  sessionId: string;
  action: "reply" | "defer" | "no_reply";
  message: string;
  request: string;
}) {
  const observation = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM headlong_runs WHERE id = ${input.runId} FOR UPDATE`
    );
    const [run] = await transaction
      .select({ status: headlongRuns.status })
      .from(headlongRuns)
      .where(eq(headlongRuns.id, input.runId))
      .limit(1);
    if (run?.status === "completed") {
      const [existing] = await transaction
        .select()
        .from(headlongEvents)
        .where(
          and(
            eq(headlongEvents.runId, input.runId),
            eq(headlongEvents.type, "observation")
          )
        )
        .limit(1);
      if (existing) return existing;
    }
    const message = input.message.trim();
    const request = input.request.trim();
    await transaction.insert(headlongEvents).values({
      content: `Claimed inbound message ${input.triggerEventId}`,
      eveSessionId: input.sessionId,
      id: nanoid(),
      metadata: { runId: input.runId },
      parentId: input.triggerEventId,
      runId: input.runId,
      thinker: "responder",
      type: "reply_claim",
      workspaceId: input.workspaceId,
    });
    if (input.action !== "no_reply" && message) {
      await transaction.insert(headlongEvents).values({
        content: message,
        direction: "outbound",
        eveSessionId: input.sessionId,
        id: nanoid(),
        parentId: input.triggerEventId,
        runId: input.runId,
        thinker: "responder",
        type: "message",
        workspaceId: input.workspaceId,
      });
    }
    if (input.action === "defer" && request) {
      await transaction.insert(headlongEvents).values({
        content: `Pending request: ${request}`,
        eveSessionId: input.sessionId,
        id: nanoid(),
        metadata: {
          decision: "deferred",
          person: "company member",
          request,
        },
        parentId: input.triggerEventId,
        runId: input.runId,
        thinker: "responder",
        type: "action",
        workspaceId: input.workspaceId,
      });
    }
    const decision =
      input.action === "no_reply"
        ? "no-reply"
        : input.action === "defer"
          ? "deferred"
          : "replied";
    const [createdObservation] = await transaction
      .insert(headlongEvents)
      .values({
        content:
          input.action === "no_reply"
            ? "Chose not to reply because the message needed no response."
            : input.action === "defer"
              ? `Sent a holding reply and handed the mind a pending request: ${request}`
              : `Replied: ${message}`,
        eveSessionId: input.sessionId,
        id: nanoid(),
        metadata: { decision },
        parentId: input.triggerEventId,
        runId: input.runId,
        thinker: "responder",
        type: "observation",
        workspaceId: input.workspaceId,
      })
      .returning();
    if (!createdObservation) {
      throw new Error("The responder decision was not stored.");
    }
    await transaction
      .update(headlongRuns)
      .set({ completedAt: new Date(), status: "completed" })
      .where(eq(headlongRuns.id, input.runId));
    return createdObservation;
  });
  await appendPassiveRetrieval(observation);
  return observation;
}

export async function recordMonolithResult(input: {
  workspaceId: string;
  runId: string;
  triggerEventId: string;
  sessionId: string;
  fn: HeadlongFunction;
  content: string;
  resolves?: string;
}) {
  const event = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM headlong_runs WHERE id = ${input.runId} FOR UPDATE`
    );
    const [run] = await transaction
      .select({ status: headlongRuns.status })
      .from(headlongRuns)
      .where(eq(headlongRuns.id, input.runId))
      .limit(1);
    if (run?.status === "completed") {
      const [existing] = await transaction
        .select()
        .from(headlongEvents)
        .where(eq(headlongEvents.runId, input.runId))
        .limit(1);
      if (existing) {
        const delaySeconds = existing.metadata?.delaySeconds ?? 0;
        return { delaySeconds, event: existing };
      }
    }
    const [mind] = await transaction
      .select({
        backoffLevel: headlongMinds.backoffLevel,
        goalReviewAt: headlongMinds.goalReviewAt,
        spontaneousWakes: headlongMinds.spontaneousWakes,
        ticksAtLevel: headlongMinds.ticksAtLevel,
      })
      .from(headlongMinds)
      .where(eq(headlongMinds.workspaceId, input.workspaceId))
      .limit(1);
    const [trigger] = await transaction
      .select({ thinker: headlongEvents.thinker, type: headlongEvents.type })
      .from(headlongEvents)
      .where(eq(headlongEvents.id, input.triggerEventId))
      .limit(1);
    const reactive =
      trigger?.type !== "monolith-wake" && trigger?.thinker !== "monolith";
    const wake = computeHeadlongWake({
      function: input.fn,
      level: mind?.backoffLevel ?? 0,
      reactive,
      ticksAtLevel: mind?.ticksAtLevel ?? 0,
    });
    const stepType = headlongStepType(input.fn);
    const metadata: NonNullable<typeof headlongEvents.$inferInsert.metadata> = {
      delaySeconds: wake.delaySeconds,
      function: input.fn,
    };
    if (input.resolves) metadata.resolves = input.resolves;
    const [created] = await transaction
      .insert(headlongEvents)
      .values({
        content: input.content,
        eveSessionId: input.sessionId,
        id: nanoid(),
        metadata,
        parentId: input.triggerEventId,
        runId: input.runId,
        thinker: "monolith",
        type: stepType,
        workspaceId: input.workspaceId,
      })
      .returning();
    if (!created) throw new Error("The monolith event was not stored.");
    await transaction
      .update(headlongMinds)
      .set({
        backoffLevel: wake.nextLevel,
        backoffSeconds: wake.delaySeconds,
        goalReviewAt: mind?.goalReviewAt ?? null,
        nextWakeAt: new Date(Date.now() + wake.delaySeconds * 1000),
        spontaneousWakes: (mind?.spontaneousWakes ?? 0) + (reactive ? 0 : 1),
        ticksAtLevel: wake.nextTicksAtLevel,
        updatedAt: new Date(),
      })
      .where(eq(headlongMinds.workspaceId, input.workspaceId));
    await transaction
      .update(headlongRuns)
      .set({ completedAt: new Date(), status: "completed" })
      .where(eq(headlongRuns.id, input.runId));
    return { delaySeconds: wake.delaySeconds, event: created };
  });
  await appendPassiveRetrieval(event.event);
  return event;
}

export async function searchHeadlongMemories(
  workspaceId: string,
  query: string
) {
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return db
    .select()
    .from(headlongMemories)
    .where(
      and(
        eq(headlongMemories.workspaceId, workspaceId),
        or(
          ilike(headlongMemories.title, pattern),
          ilike(headlongMemories.content, pattern)
        )
      )
    )
    .orderBy(desc(headlongMemories.updatedAt))
    .limit(20);
}

export async function writeHeadlongMemory(input: {
  workspaceId: string;
  id?: string;
  kind: string;
  title: string;
  content: string;
  expiresAt?: string | null;
}) {
  const id = input.id ?? nanoid();
  const [memory] = await db
    .insert(headlongMemories)
    .values({
      content: input.content,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      id,
      kind: input.kind,
      title: input.title,
      workspaceId: input.workspaceId,
    })
    .onConflictDoUpdate({
      target: [headlongMemories.workspaceId, headlongMemories.id],
      set: {
        content: input.content,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        kind: input.kind,
        title: input.title,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!memory) throw new Error("The memory was not stored.");
  return memory;
}

export async function forgetHeadlongMemory(workspaceId: string, id: string) {
  const [forgotten] = await db
    .delete(headlongMemories)
    .where(
      and(
        eq(headlongMemories.workspaceId, workspaceId),
        eq(headlongMemories.id, id)
      )
    )
    .returning({ id: headlongMemories.id });
  return { forgotten: Boolean(forgotten) };
}

export async function setHeadlongMindStatus(
  scope: AccessScope,
  status: "active" | "paused"
) {
  await ensureHeadlongMind(scope);
  await db
    .update(headlongMinds)
    .set({ status, updatedAt: new Date() })
    .where(eq(headlongMinds.workspaceId, scope.workspaceId));
}

export async function setHeadlongRetrieval(
  scope: AccessScope,
  enabled: boolean
) {
  await ensureHeadlongMind(scope);
  await db
    .update(headlongMinds)
    .set({ retrievalEnabled: enabled, updatedAt: new Date() })
    .where(eq(headlongMinds.workspaceId, scope.workspaceId));
}

export function computeHeadlongWake(input: {
  function: HeadlongFunction;
  level: number;
  reactive: boolean;
  ticksAtLevel: number;
}) {
  if (input.reactive || ["act", "share"].includes(input.function)) {
    return { delaySeconds: 0, nextLevel: 0, nextTicksAtLevel: 0 };
  }
  const nextTicksAtLevel = input.ticksAtLevel + 1;
  const nextLevel =
    nextTicksAtLevel >= 3 ? Math.min(input.level + 1, 7) : input.level;
  const settledTicks = nextTicksAtLevel >= 3 ? 0 : nextTicksAtLevel;
  const cap = input.function === "idle" ? 300 : 60;
  return {
    delaySeconds: Math.min(delayForLevel(nextLevel), cap),
    nextLevel,
    nextTicksAtLevel: settledTicks,
  };
}

function escapePrompt(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function headlongStepType(fn: HeadlongFunction) {
  if (fn === "act" || fn === "share") return "observation" as const;
  if (fn === "idle") return "idle" as const;
  return "thought" as const;
}

function delayForLevel(level: number) {
  if (level <= 0) return 0;
  return Math.min(5 * 2 ** (level - 1), 300);
}

function selectRelatedMemories(
  memories: readonly (typeof headlongMemories.$inferSelect)[],
  query: string,
  limit: number
) {
  const words = new Set(
    query
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3)
  );
  return memories
    .map((memory) => ({
      memory,
      score: `${memory.title} ${memory.content}`
        .toLocaleLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => words.has(word)).length,
    }))
    .filter(({ score }) => score > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

async function appendPassiveRetrieval(
  trigger: typeof headlongEvents.$inferSelect
) {
  const [mind] = await db
    .select({ enabled: headlongMinds.retrievalEnabled })
    .from(headlongMinds)
    .where(eq(headlongMinds.workspaceId, trigger.workspaceId))
    .limit(1);
  if (!mind?.enabled || trigger.thinker === "retrieval") return;

  const [memories, recentRetrievals] = await Promise.all([
    db
      .select()
      .from(headlongMemories)
      .where(eq(headlongMemories.workspaceId, trigger.workspaceId))
      .orderBy(desc(headlongMemories.updatedAt))
      .limit(200),
    db
      .select({ metadata: headlongEvents.metadata })
      .from(headlongEvents)
      .where(
        and(
          eq(headlongEvents.workspaceId, trigger.workspaceId),
          eq(headlongEvents.thinker, "retrieval")
        )
      )
      .orderBy(desc(headlongEvents.createdAt))
      .limit(20),
  ]);
  const seen = new Set(
    recentRetrievals
      .map((event) => event.metadata?.retrievedMemoryId)
      .filter((id): id is string => Boolean(id))
  );
  const match = selectRelatedMemories(
    memories.filter((memory) => !seen.has(memory.id)),
    trigger.content,
    1
  )[0];
  if (!match) return;
  const sharedWords = sharedWordCount(
    trigger.content,
    `${match.title} ${match.content}`
  );
  if (sharedWords < 2) return;
  await appendHeadlongEvent({
    content: `I'm reminded of memory ${match.id}: ${match.title} (${String(sharedWords)} shared words)`,
    metadata: { retrievedMemoryId: match.id },
    parentId: trigger.id,
    thinker: "retrieval",
    type: "observation",
    workspaceId: trigger.workspaceId,
  });
}

function sharedWordCount(left: string, right: string) {
  const leftWords = wordSet(left);
  return [...wordSet(right)].filter((word) => leftWords.has(word)).length;
}

function wordSet(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3)
  );
}

function nonEmpty<T>(value: string | undefined, fallback: T): string | T {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

async function requireCompany(scope: AccessScope) {
  const [company] = await db
    .select({ name: workspaces.name })
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
  if (!company) throw new Error("A company workspace is required.");
  return company;
}

function slugIdentity(value: string) {
  const slug = value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "ada";
}
