import { nanoid } from "nanoid";
import { and, count, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
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
  | "action"
  | "share"
  | "think"
  | "learn"
  | "recall"
  | "goals"
  | "values"
  | "idle";

export async function ensureHeadlongMind(scope: AccessScope) {
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

  const identity = [
    `You are the continuously operating company agent for ${company.name ?? "this company"}.`,
    "You own outcomes, maintain institutional memory, pursue goals, and communicate with company members.",
    "Be candid, concrete, resourceful, and action-oriented. Never pretend an action occurred when it did not.",
  ].join(" ");
  await db
    .insert(headlongMinds)
    .values({ identity, workspaceId: scope.workspaceId })
    .onConflictDoNothing({ target: headlongMinds.workspaceId });

  const [mind] = await db
    .select()
    .from(headlongMinds)
    .where(eq(headlongMinds.workspaceId, scope.workspaceId))
    .limit(1);
  if (!mind) throw new Error("The company mind could not be initialized.");
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
  metadata?: { delaySeconds?: number; runId?: string };
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
  return appendHeadlongEvent({
    authorUserId: scope.userId,
    content: message,
    direction: "inbound",
    thinker: "human",
    type: "message",
    workspaceId: scope.workspaceId,
  });
}

export async function compileHeadlongContext(
  workspaceId: string,
  triggerEventId: string,
  thinker: HeadlongThinker
) {
  const [mind, events, memories, monolithWakeCount, latestGoalReview] =
    await Promise.all([
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
        .limit(80),
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
        .limit(50),
      db
        .select({ count: count() })
        .from(headlongEvents)
        .where(
          and(
            eq(headlongEvents.workspaceId, workspaceId),
            eq(headlongEvents.thinker, "monolith")
          )
        ),
      db
        .select({ createdAt: headlongEvents.createdAt })
        .from(headlongEvents)
        .where(
          and(
            eq(headlongEvents.workspaceId, workspaceId),
            eq(headlongEvents.type, "goals")
          )
        )
        .orderBy(desc(headlongEvents.createdAt))
        .limit(1),
    ]);
  if (!mind[0]) throw new Error("Company mind not found.");
  const orderedEvents = events.toReversed();
  const trigger = orderedEvents.find((event) => event.id === triggerEventId);
  const wakeCount = monolithWakeCount[0]?.count ?? 0;
  const goalReviewAt = latestGoalReview[0]?.createdAt;
  const goalReviewDue =
    !goalReviewAt ||
    Date.now() - goalReviewAt.getTime() >= 7 * 24 * 60 * 60 * 1000;
  return [
    `<headlong thinker="${thinker}" workspace="${workspaceId}" trigger="${triggerEventId}">`,
    `<identity>${escapePrompt(mind[0].identity)}</identity>`,
    `<trigger>${escapePrompt(trigger?.content ?? "scheduled autonomous wake")}</trigger>`,
    `<cadence wake-count="${String(wakeCount)}" share-hint="${String(
      thinker === "monolith" && wakeCount > 0 && wakeCount % 12 === 0
    )}" goal-review-due="${String(thinker === "monolith" && goalReviewDue)}" />`,
    "<memories>",
    ...memories.map(
      (memory) =>
        `[${memory.kind}:${memory.id}] ${memory.title}\n${memory.content}`
    ),
    "</memories>",
    "<trajectory>",
    ...orderedEvents.map(
      (event) =>
        `${event.createdAt.toISOString()} ${event.thinker}/${event.type}/${event.direction}: ${event.content}`
    ),
    "</trajectory>",
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
  reply: string | null;
  observation: string;
}) {
  return db.transaction(async (transaction) => {
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
    const [observation] = await transaction
      .insert(headlongEvents)
      .values({
        content: input.observation,
        eveSessionId: input.sessionId,
        id: nanoid(),
        parentId: input.triggerEventId,
        runId: input.runId,
        thinker: "responder",
        type: "observation",
        workspaceId: input.workspaceId,
      })
      .returning();
    if (!observation)
      throw new Error("The responder observation was not stored.");
    if (input.reply?.trim()) {
      await transaction.insert(headlongEvents).values({
        content: input.reply.trim(),
        direction: "outbound",
        eveSessionId: input.sessionId,
        id: nanoid(),
        parentId: observation.id,
        runId: input.runId,
        thinker: "responder",
        type: "share",
        workspaceId: input.workspaceId,
      });
    }
    await transaction
      .update(headlongRuns)
      .set({ completedAt: new Date(), status: "completed" })
      .where(eq(headlongRuns.id, input.runId));
    return observation;
  });
}

export async function recordMonolithResult(input: {
  workspaceId: string;
  runId: string;
  triggerEventId: string;
  sessionId: string;
  fn: HeadlongFunction;
  content: string;
  memory?: {
    id?: string;
    kind: typeof headlongMemories.$inferInsert.kind;
    title: string;
    content: string;
    expiresAt?: string | null;
  };
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
      .select({ backoffSeconds: headlongMinds.backoffSeconds })
      .from(headlongMinds)
      .where(eq(headlongMinds.workspaceId, input.workspaceId))
      .limit(1);
    const current = mind?.backoffSeconds ?? 5;
    const { delaySeconds, nextBackoff } = computeHeadlongWake(
      current,
      input.fn
    );
    const [created] = await transaction
      .insert(headlongEvents)
      .values({
        content: input.content,
        direction: input.fn === "share" ? "outbound" : "internal",
        eveSessionId: input.sessionId,
        id: nanoid(),
        metadata: { delaySeconds },
        parentId: input.triggerEventId,
        runId: input.runId,
        thinker: "monolith",
        type: input.fn,
        workspaceId: input.workspaceId,
      })
      .returning();
    if (!created) throw new Error("The monolith event was not stored.");
    if (input.memory) {
      const memoryId = input.memory.id ?? nanoid();
      await transaction
        .insert(headlongMemories)
        .values({
          content: input.memory.content,
          expiresAt: input.memory.expiresAt
            ? new Date(input.memory.expiresAt)
            : null,
          id: memoryId,
          kind: input.memory.kind,
          title: input.memory.title,
          workspaceId: input.workspaceId,
        })
        .onConflictDoUpdate({
          target: [headlongMemories.workspaceId, headlongMemories.id],
          set: {
            content: input.memory.content,
            expiresAt: input.memory.expiresAt
              ? new Date(input.memory.expiresAt)
              : null,
            kind: input.memory.kind,
            title: input.memory.title,
            updatedAt: new Date(),
          },
        });
    }
    await transaction
      .update(headlongMinds)
      .set({
        backoffSeconds: nextBackoff,
        nextWakeAt: new Date(Date.now() + delaySeconds * 1000),
        updatedAt: new Date(),
      })
      .where(eq(headlongMinds.workspaceId, input.workspaceId));
    await transaction
      .update(headlongRuns)
      .set({ completedAt: new Date(), status: "completed" })
      .where(eq(headlongRuns.id, input.runId));
    return { delaySeconds, event: created };
  });
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

export function computeHeadlongWake(
  currentBackoff: number,
  fn: HeadlongFunction
) {
  if (fn === "action" || fn === "share") {
    return { delaySeconds: 0, nextBackoff: 5 };
  }
  return {
    delaySeconds: currentBackoff,
    nextBackoff: Math.min(currentBackoff * 2, fn === "idle" ? 300 : 60),
  };
}

function escapePrompt(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
